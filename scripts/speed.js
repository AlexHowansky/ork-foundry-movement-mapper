import {debug, module} from "./util.js";

// Default data paths and action name mappings for known game systems. The
// path template's {action} token is replaced with the mapped action key.
const presets = {
    dnd5e: {
        path: "system.attributes.movement.{action}",
        actions: {},
    },
    pf2e: {
        path: "system.movement.speeds.{action}.value",
        actions: {walk: "land"},
    },
    sf2e: {
        path: "system.movement.speeds.{action}.value",
        actions: {walk: "land"},
    },
};

const fallback = {
    path: "system.attributes.movement.{action}",
    actions: {},
};

// Parse the actionMap setting, e.g. "walk=land, fly=fly".
function parseActionMap(value) {
    const map = {};
    for (const pair of value.split(",")) {
        const [action, key] = pair.split("=").map((part) => part.trim());
        if (action && key) {
            map[action] = key;
        }
    }
    return map;
}

function readSpeed(actor, path, actions, action) {
    const key = actions[action] ?? action;
    const speed = Number(foundry.utils.getProperty(actor, path.replaceAll("{action}", key)));
    debug(`  speed for action ${action} at ${path.replaceAll("{action}", key)} = ${speed}`);
    return Number.isFinite(speed) && speed > 0 ? speed : null;
}

/**
 * Get the movement speed of a token for its active movement action, falling
 * back to its walk speed if it has no speed for that action.
 *
 * @returns {number|null} The speed in scene grid units, or null if unknown.
 */
export function getSpeed(token) {
    const actor = token.actor;
    if (!actor) {
        return null;
    }
    const preset = presets[game.system.id] ?? fallback;
    const path = game.settings.get(module.id, "speedPath").trim() || preset.path;
    const actions = {...preset.actions, ...parseActionMap(game.settings.get(module.id, "actionMap"))};
    const action = token.document.movementAction;
    return readSpeed(actor, path, actions, action)
        ?? (action === "walk" ? null : readSpeed(actor, path, actions, "walk"));
}
