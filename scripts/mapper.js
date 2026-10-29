import {debug, module} from "./util.js";
import {getSpeed} from "./speed.js";

// A minimal binary min-heap of [cost, ...data] entries.
class Heap {
    constructor() {
        this.items = [];
    }

    get size() {
        return this.items.length;
    }

    push(item) {
        const items = this.items;
        items.push(item);
        let i = items.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (items[parent][0] <= items[i][0]) {
                break;
            }
            [items[parent], items[i]] = [items[i], items[parent]];
            i = parent;
        }
    }

    pop() {
        const items = this.items;
        const top = items[0];
        const last = items.pop();
        if (items.length > 0) {
            items[0] = last;
            let i = 0;
            for (;;) {
                const left = i * 2 + 1;
                const right = left + 1;
                let smallest = i;
                if (left < items.length && items[left][0] < items[smallest][0]) {
                    smallest = left;
                }
                if (right < items.length && items[right][0] < items[smallest][0]) {
                    smallest = right;
                }
                if (smallest === i) {
                    break;
                }
                [items[smallest], items[i]] = [items[i], items[smallest]];
                i = smallest;
            }
        }
        return top;
    }
}

export class Mapper {
    // The most recently computed movement area, reused until something that
    // could affect it changes.
    static cache = null;

    static invalidate() {
        Mapper.cache = null;
    }

    constructor() {
        // Conveniently, if the named highlight layer already exists, we'll get
        // it back rather than creating a new one or throwing an error.
        this.layer = canvas.interface.grid.addHighlightLayer(module.id);
    }

    hide() {
        debug("erasing existing movement area");
        canvas.interface.grid.clearHighlightLayer(module.id);
        // Clearing the layer only erases its graphics, not the distance labels.
        for (const child of this.layer.removeChildren()) {
            child.destroy();
        }
    }

    show(token) {
        debug(`drawing movement area for ${token.name}`);
        const speed = getSpeed(token);
        if (speed === null) {
            debug("  no movement speed found, skipping");
            return;
        }
        const spent = this.getSpentMovement(token);
        const moveBudget = Math.max(0, speed - spent);
        const dashBudget = game.settings.get(module.id, "showDash")
            ? moveBudget + speed * Math.max(0, game.settings.get(module.id, "dashMultiplier") - 1)
            : moveBudget;
        debug(`  speed = ${speed}, spent = ${spent}, move budget = ${moveBudget}, dash budget = ${dashBudget}`);

        const doc = token.document;
        const key = [token.id, doc.x, doc.y, doc.elevation, doc.movementAction, moveBudget, dashBudget].join("|");
        if (Mapper.cache?.key !== key) {
            Mapper.cache = {key, costs: this.search(token, dashBudget)};
        }

        const alpha = game.settings.get(module.id, "opacity");
        const colorMove = foundry.utils.Color.from(game.settings.get(module.id, "colorMove"));
        const colorDash = foundry.utils.Color.from(game.settings.get(module.id, "colorDash"));
        const showDistance = game.settings.get(module.id, "showDistance");
        const style = CONFIG.canvasTextStyle.clone();
        style.fontSize = Math.max(8, Math.round(Math.min(canvas.grid.sizeX, canvas.grid.sizeY) / 4));
        for (const [i, j, cost] of Mapper.cache.costs) {
            const {x, y} = canvas.grid.getTopLeftPoint({i, j});
            const color = cost <= moveBudget ? colorMove : colorDash;
            canvas.interface.grid.highlightPosition(module.id, {x, y, color, alpha});
            if (showDistance) {
                this.drawDistance({i, j}, cost, style);
            }
        }
    }

    // Label a space with the cumulative movement cost to reach it.
    drawDistance(offset, cost, style) {
        const distance = Math.round(cost * 10) / 10;
        const text = new foundry.canvas.containers.PreciseText(`${distance}`, style);
        const center = canvas.grid.getCenterPoint(offset);
        text.anchor.set(0.5, 0.5);
        text.position.set(center.x, center.y);
        this.layer.addChild(text);
    }

    // Get the movement cost already spent by the token during its current
    // combat turn. Core clears the movement history at the start of a turn.
    getSpentMovement(token) {
        const combat = game.combat;
        if (!combat?.started || combat.combatant?.tokenId !== token.id) {
            return 0;
        }
        const history = token.document.movementHistory;
        if (!history?.length) {
            return 0;
        }
        const cost = token.document.measureMovementPath(history).cost;
        return Number.isFinite(cost) ? cost : Infinity;
    }

    // Run Dijkstra's algorithm over the grid from the token's position.
    // Returns a list of [i, j, cost] for every space reachable within budget,
    // excluding the starting space.
    search(token, budget) {
        const grid = canvas.grid;
        const doc = token.document;
        const action = doc.movementAction;
        const actionConfig = CONFIG.Token.movement.actions[action];
        const D = CONST.GRID_DIAGONALS;
        const alternating = grid.isSquare && [D.ALTERNATING_1, D.ALTERNATING_2].includes(grid.diagonals);
        const sceneRect = canvas.dimensions.sceneRect;
        const hasTerrain = typeof token.createTerrainMovementPath === "function"
            && canvas.scene.regions.some((region) => !region.hidden
                && region.behaviors.some((behavior) => !behavior.disabled));

        // Anchor the search on the token's top-left space on square grids, or
        // the space containing its center on hex grids. Positions of other
        // spaces are found by translating the token by the difference between
        // space centers, which keeps it aligned with the grid.
        const start = grid.isSquare
            ? grid.getOffset({x: doc.x + grid.sizeX / 2, y: doc.y + grid.sizeY / 2})
            : grid.getOffset(doc.getCenterPoint());
        const startCenter = grid.getCenterPoint(start);
        const position = (offset) => {
            const center = grid.getCenterPoint(offset);
            return {x: doc.x + center.x - startCenter.x, y: doc.y + center.y - startCenter.y};
        };
        const origin = (pos) => (doc.getMovementOrigin ?? doc.getCenterPoint).call(doc, pos);

        // The multiplier applied by terrain and the movement action to a step
        // between two adjacent spaces, or null if the step is impossible.
        const ratios = new Map();
        const ratio = (a, b, posA, posB) => {
            const key = `${a.i},${a.j}>${b.i},${b.j}`;
            if (ratios.has(key)) {
                return ratios.get(key);
            }
            let result = null;
            if (actionConfig?.teleport || !token.checkCollision(origin(posB), {origin: origin(posA), type: "move", mode: "any"})) {
                let path = [{...posA, action}, {...posB, action}];
                if (hasTerrain) {
                    path = token.createTerrainMovementPath(path);
                }
                const {cost, distance} = token.measureMovementPath(path);
                if (Number.isFinite(cost)) {
                    result = distance > 0 ? cost / distance : 1;
                }
            }
            ratios.set(key, result);
            return result;
        };

        // The base length of a step, ignoring terrain. On alternating diagonal
        // grids, the parity of diagonals moved so far determines the length.
        const stepLength = (diagonal, parity) => {
            if (!diagonal) {
                return grid.distance;
            }
            switch (grid.diagonals) {
                case D.EQUIDISTANT:
                    return grid.distance;
                case D.EXACT:
                    return grid.distance * Math.SQRT2;
                case D.APPROXIMATE:
                    return grid.distance * 1.5;
                case D.RECTILINEAR:
                    return grid.distance * 2;
                case D.ALTERNATING_1:
                    return grid.distance * (parity ? 2 : 1);
                case D.ALTERNATING_2:
                    return grid.distance * (parity ? 1 : 2);
                default:
                    return Infinity;
            }
        };

        const best = new Map();
        const settled = new Set();
        const heap = new Heap();
        heap.push([0, start.i, start.j, 0]);
        best.set(`${start.i},${start.j},0`, 0);
        while (heap.size > 0) {
            const [cost, i, j, parity] = heap.pop();
            const stateKey = `${i},${j},${parity}`;
            if (settled.has(stateKey)) {
                continue;
            }
            settled.add(stateKey);
            const a = {i, j};
            const posA = position(a);
            for (const b of grid.getAdjacentOffsets(a)) {
                const center = grid.getCenterPoint(b);
                if (!sceneRect.contains(center.x, center.y)) {
                    continue;
                }
                const diagonal = grid.isSquare && b.i !== i && b.j !== j;
                const length = stepLength(diagonal, parity);
                if (!Number.isFinite(length)) {
                    continue;
                }
                const posB = position(b);
                const r = ratio(a, b, posA, posB);
                if (r === null) {
                    continue;
                }
                const next = cost + length * r;
                const nextParity = alternating && diagonal ? 1 - parity : parity;
                const nextKey = `${b.i},${b.j},${nextParity}`;
                if (next > budget || next >= (best.get(nextKey) ?? Infinity)) {
                    continue;
                }
                best.set(nextKey, next);
                heap.push([next, b.i, b.j, nextParity]);
            }
        }

        // Collapse diagonal parity states to the cheapest cost per space.
        const costs = new Map();
        for (const [stateKey, cost] of best) {
            const [i, j] = stateKey.split(",").map(Number);
            if (i === start.i && j === start.j) {
                continue;
            }
            const spaceKey = `${i},${j}`;
            if (cost < (costs.get(spaceKey)?.[2] ?? Infinity)) {
                costs.set(spaceKey, [i, j, cost]);
            }
        }
        debug(`  ${costs.size} reachable spaces, ${ratios.size} steps measured`);
        return [...costs.values()];
    }
}
