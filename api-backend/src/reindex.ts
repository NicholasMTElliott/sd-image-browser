import { imageLookup, imageTagLookup } from './index.js';

export function reindex() {
    for (const id in imageLookup) {
        const tags = imageLookup[id].tags;
        for (const tag of tags) {
            imageTagLookup[tag] = [...(imageTagLookup[tag] ?? []), id];
        }
        if (tags.length == 0) {
            imageTagLookup[''].push(id);
        }
    }
}
