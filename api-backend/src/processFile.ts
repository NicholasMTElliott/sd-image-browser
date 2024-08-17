import fs from 'fs/promises';
import sharp, { Sharp } from 'sharp';
import crypto from 'crypto';
import { supportedImages, imageTagLookup, imageLookup } from './index.js';
import { promisify } from 'util';
import { exec } from 'child_process';
import { pass } from './inventoryImages.js';
import memoize from 'p-memoize';
import ExpiryMap from 'expiry-map';


// Some constants
const MaxImageDimension = 4096;

const execAsync = promisify(exec);


const cache = new ExpiryMap(500_000); // Cached values expire after 500 seconds
export const processFile = memoize(iProcessFile,  {cache, cacheKey: arguments_ => JSON.stringify(arguments_)});
export async function iProcessFile(name: string, path: string) {
    try {
        const fileParts = name.split('.');
        let extension = fileParts[fileParts.length - 1].toLowerCase();
        const namePart = fileParts.slice(0, fileParts.length - 1).join('.');

        if (supportedImages.indexOf(extension) >= 0) {
            // process this image!
            // try and read any associated attribute information
            let tags: string[] = [];
            let metadata = '';
            try {
                const tagsFile = await fs.readFile(`${path}/${namePart}.txt`);
                const fileContents = tagsFile.toString('utf-8');
                metadata = fileContents;
                tags = fileContents.split('\n')[0].split(/[,|]/).map(tag => tag.toLowerCase().trim().replace(/[{()}]/g, '').trim());
            }
            catch { }

            const originalFileName = `${path}/${namePart}.${extension}`;
            let fullFileName = originalFileName;

            // If this file already exists and the size is the same, we can move on
            const stat = await fs.stat(fullFileName);
            const id = crypto.createHash('md5').update(`${namePart}.${extension}.${stat.size}`).digest("hex");
            if(imageLookup[id] && imageLookup[id].size === stat.size)
            {
                imageLookup[id].pass = pass;
                return;
            }
            
            let previewImageDataUrl: string;
            let thumbnailBuffer: Buffer;

            if(extension == 'webp')
            {
                const originalFile = sharp(fullFileName, { pages: -1 });
                // Now create the thumbnail
                const resizedBuffer = originalFile
                    .resize(128, 128, { fit: 'contain' });     

                thumbnailBuffer = await resizedBuffer
                        .webp({ quality: 60 })
                        .toBuffer();

                previewImageDataUrl = `data:image/webp;base64,${thumbnailBuffer.toString('base64')}`;
            }
            else
            {
                if(extension === 'png')
                {
                    const fullData = (await execAsync(`magick identify -verbose '${fullFileName}'`)).stdout.trim()
                    const fileMetadata = fullData.match(/parameters: (.+?)\n\s+[a-zA-Z]+:/s)?.[1] ?? '';
                    if(fileMetadata?.length && !metadata.length)
                    {
                        metadata = fileMetadata;
                        await fs.writeFile(`${path}/${namePart}.txt`, fileMetadata);
                        console.log('Successfully wrote metadata');
                    }
                }

                // convert and save
                // Specify 'all pages' because this may be animated
                const originalFile = sharp(fullFileName, { pages: -1 });
                const originalFilename = fullFileName;
                const fileInfo = await originalFile.metadata();
                const reducedOriginal = originalFile
                    // Resize down to a max width of 4096.  We don't do height because of the way animated images calculate it
                    // (basically they stack all frames on top of each other)
                    .resize({ 
                        width: Math.min(fileInfo.width ?? MaxImageDimension,MaxImageDimension),
                        fit: 'inside',
                        withoutEnlargement: true
                     })
                     // Do chroma sampling for a better visual compression
                    .webp({
                        quality: 80
                    });
                const reducedOriginalBytes = await reducedOriginal.toBuffer();
                const convertedFilename = `${path}/${namePart}.webp`;
                await fs.writeFile(convertedFilename, reducedOriginalBytes);
                console.log('Successfully converted to webp format');

                // update our file references to this new version
                extension = 'webp';
                fullFileName = `${path}/${namePart}.${extension}`;

                // Now create the thumbnail
                const resizedBuffer = originalFile
                    .resize(128, 128, { fit: 'contain' });     

                thumbnailBuffer = await resizedBuffer
                        .webp({ quality: 60 })
                        .toBuffer();

                previewImageDataUrl = `data:image/webp;base64,${thumbnailBuffer.toString('base64')}`;

                // Since we have converted to webp, we can delete the original
                const newFileStat = await fs.stat(convertedFilename);
                if(newFileStat.size === reducedOriginalBytes.byteLength)
                {
                    console.log(`Removing the original  ${originalFilename}`);
                    originalFile.destroy();
                    await fs.rm(originalFilename);
                }
                else
                {
                    console.error(`Skipped the delete because ${newFileStat.size} != ${reducedOriginalBytes.byteLength}`);
                }
            }
            
            try {
                for (const tag of tags) {
                    imageTagLookup[tag] = [...(imageTagLookup[tag] ?? []), id];
                }
                if (tags.length == 0) {
                    imageTagLookup[''].push(id);
                }

                imageLookup[id] = {
                    id,
                    fullFileName,
                    path,
                    name: namePart,
                    extension,
                    tags,
                    preview: previewImageDataUrl,
                    modified: stat.mtime.toISOString(),
                    size: stat.size,
                    metadata,
                    pass
                };
            }
            catch (err) { }
        }
    }
    catch (err) {
        console.error(`Unexpected error handling ${path}/${name}`, err);
    }
}
