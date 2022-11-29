import fs from 'fs/promises';
import sharp from 'sharp';
import crypto from 'crypto';
import { supportedImages, foundImages, imageTagLookup, imageLookup } from './index';

export async function processFile(name: string, path: string) {
    console.log(`processFile ${name}, ${path}`);
    try {
        const fileParts = name.split('.');
        const extension = fileParts[fileParts.length - 1].toLowerCase();
        const namePart = fileParts.slice(0, fileParts.length - 1).join('.');

        if (supportedImages.indexOf(extension) >= 0) {
            // process this image!
            // try and read any associated attribute information
            let tags: string[] = [];
            try {
                const tagsFile = await fs.readFile(`${path}/${namePart}.txt`);
                const fileContents = tagsFile.toString('utf-8');
                tags = fileContents.split('\n')[0].split(/[,|]/).map(tag => tag.toLowerCase().trim().replace(/[{()}]/g, '').trim());
            }
            catch { }

            const fullFileName = `${path}/${namePart}.${extension}`;

            const resizedBuffer = sharp(fullFileName)
                .resize(128, 128, { fit: 'contain' });

            const thumbnailBuffer = await resizedBuffer
                .jpeg({ quality: 60 })
                .toBuffer();

            let id = crypto.createHash('md5').update(await resizedBuffer.png().toBuffer()).digest("hex");
            try {
                // see if there's already an entry for this
                const existingEntry = foundImages.find(i => i.path === path && i.name === namePart);
                if (existingEntry && extension === 'png') {
                    // we replace the existing entry
                    existingEntry.extension = extension;
                    existingEntry.tags = tags;
                }
                else if (!existingEntry) {
                    const imageIndex = foundImages.length;
                    const thumbnailImage = `data:image/jpeg;base64,${thumbnailBuffer.toString('base64')}`;
                    const stat = await fs.stat(fullFileName);
                    foundImages.push({
                        id,
                        fullFileName,
                        path,
                        name: namePart,
                        extension,
                        tags,
                        preview: thumbnailImage,
                        modified: stat.mtime.toISOString()
                    });
                    for (const tag of tags) {
                        imageTagLookup[tag] = [...(imageTagLookup[tag] ?? []), imageIndex];
                    }
                    if (tags.length == 0) {
                        imageTagLookup[''].push(imageIndex);
                    }
                    imageLookup[foundImages[imageIndex].id] = imageIndex;
                }
            }
            catch (err) { }
        }
    }
    catch (err) {
        console.error(`Unexpected error handling ${path}/${name}`);
    }
}
