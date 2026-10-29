import {debug, log, module} from "./util.js";
import {Mapper} from "./mapper.js";

log("module loaded");

// The token whose movement area is currently drawn, if any.
let hovered = null;

function setting(key, type, scope, config = {}) {
    game.settings.register(module.id, key, {
        name: game.i18n.localize(`${module.id}.settings.${key}.name`),
        hint: game.i18n.localize(`${module.id}.settings.${key}.hint`),
        scope,
        config: true,
        type,
        onChange: () => {
            Mapper.invalidate();
            redraw();
        },
        ...config,
    });
}

function canShow(token) {
    if (!token.isOwner || token.isPreview || !token.actor) {
        debug("  but user does not own token or token is a preview, skipping");
        return false;
    }
    if (token.movementAnimationPromise) {
        debug("  but token is animating, skipping");
        return false;
    }
    if (canvas.grid.isGridless) {
        debug("  but scene is gridless, skipping");
        return false;
    }
    return true;
}

function redraw() {
    if (!canvas.ready) {
        return;
    }
    const mapper = new Mapper();
    mapper.hide();
    if (hovered) {
        mapper.show(hovered);
    }
}

Hooks.on("init", () => {
    setting("speedPath", String, "world", {default: ""});
    setting("actionMap", String, "world", {default: ""});
    setting("showDash", Boolean, "client", {default: true});
    setting("dashMultiplier", Number, "world", {default: 2, range: {min: 1, max: 4, step: 0.5}});
    setting("colorMove", new foundry.data.fields.ColorField({nullable: false, initial: "#00ff00"}), "client", {default: "#00ff00"});
    setting("colorDash", new foundry.data.fields.ColorField({nullable: false, initial: "#ffff00"}), "client", {default: "#ffff00"});
    setting("showDistance", Boolean, "client", {default: true});
    setting("opacity", Number, "client", {default: 0.25, range: {min: 0, max: 1, step: 0.05}});
    setting("debug", Boolean, "client", {default: false, onChange: undefined});
});

Hooks.on("hoverToken", (token, isHovered) => {
    debug(`hoverToken hook fired for ${token.name} with isHovered = ${isHovered}`);
    if (isHovered) {
        hovered = canShow(token) ? token : null;
    } else if (hovered === token) {
        hovered = null;
    } else {
        return;
    }
    redraw();
});

Hooks.on("updateToken", async (doc, changes) => {
    Mapper.invalidate();
    if (hovered?.document !== doc) {
        redraw();
        return;
    }
    // Hide while the token moves, then redraw if the cursor is still on it.
    const token = hovered;
    hovered = null;
    redraw();
    await token.movementAnimationPromise;
    if (token.hover && !token.destroyed && canShow(token)) {
        hovered = token;
        redraw();
    }
});

Hooks.on("deleteToken", (doc) => {
    if (hovered?.document === doc) {
        hovered = null;
        redraw();
    }
});

// Anything that can change speed, walls, terrain or the combat turn.
for (const hook of [
    "updateActor",
    "createWall", "updateWall", "deleteWall",
    "createRegion", "updateRegion", "deleteRegion",
    "createRegionBehavior", "updateRegionBehavior", "deleteRegionBehavior",
    "updateCombat", "deleteCombat",
]) {
    Hooks.on(hook, () => {
        Mapper.invalidate();
        redraw();
    });
}

Hooks.on("canvasTearDown", () => {
    hovered = null;
    Mapper.invalidate();
});
