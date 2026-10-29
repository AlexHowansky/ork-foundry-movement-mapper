import module from "../module.json" with { type: "json" };

export { module };

export function debug(args) {
    if (game.settings.get(module.id, "debug")) {
        log(args);
    }
}

export function error(args) {
    console.error(`%c${module.title}%c |`, "color:rgb(216, 11, 11)", "color: #000000", args);
}

export function log(args) {
    console.log(`%c${module.title}%c |`, "color:rgb(16, 165, 16)", "color: #000000", args);
}
