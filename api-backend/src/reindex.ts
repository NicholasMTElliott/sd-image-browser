import { imageLookup, imageTagLookup, foundImages } from './index';

export function reindex() {
    for (let imageIndex = 0; imageIndex < foundImages.length; imageIndex++) {
        const tags = foundImages[imageIndex].tags;
        for (const tag of tags) {
            imageTagLookup[tag] = [...(imageTagLookup[tag] ?? []), imageIndex];
        }
        if (tags.length == 0) {
            imageTagLookup[''].push(imageIndex);
        }
        imageLookup[foundImages[imageIndex].id] = imageIndex;
    }
}
