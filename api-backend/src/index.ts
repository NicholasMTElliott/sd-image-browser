import express from 'express';
import { Dirent } from 'fs';
import fs from 'fs/promises';
import sharp from 'sharp';
import {v4} from 'uuid';

interface ISDImage
{
    id: string;
    fullFileName: string;
    path: string;
    name: string;
    extension: string;
    tags: string[];
    preview: string;
}

const foundImages: ISDImage[] = [];
const imageTagLookup: { [key: string]: number[] } = {
    '': []
};
const imageLookup: { [key: string]: number } = {};
let status : 'none' | 'processing' | 'done' | 'error' = 'none';

const app = express();
const port =  process.env.PORT || 3000; // default port to listen
const sourceDir = process.env.IMAGES_ROOT_DIR || './samples';
const supportedImages = ["png", "jpg", "webp", "jpeg", "gif"];

const iterateDirectory = async (dirent: Dirent, path: string) => {
    if(dirent.isDirectory())
    {
        console.log(`Scanning ${dirent.name} and ${path}`);
        console.log(dirent.name);
          if(dirent.name[0] != '.')
          {
            const subpath = path + '/' + dirent.name;
            const dir = await fs.opendir(subpath);
            for await (const subdir of dir)
            {
                iterateDirectory(subdir, subpath);
            }
          }
    }
    else if(dirent.isFile())
    {
        const fileParts = dirent.name.split('.');
        const extension = fileParts[fileParts.length-1].toLowerCase();
        const namePart = fileParts.slice(0, fileParts.length-1).join('.');
        
        if(supportedImages.indexOf(extension) >= 0)
        {
            console.log(`File ${namePart} is a ${extension} at ${path}`);
            // process this image!
            // try and read any associated attribute information
            let tags: string[] = [];
            try
            {
                const tagsFile = await fs.readFile(`${path}/${namePart}.txt`);
                const fileContents = tagsFile.toString('utf-8');
                tags = fileContents.split('\n')[0].split(/[,|]/).map(tag => tag.toLowerCase().trim());
            }
            catch
            {}

            const fullFileName = `${path}/${namePart}.${extension}`;
            const id = v4();
            const thumbnailBuffer = await sharp(fullFileName)
                .resize(128, 128, { fit: 'contain' })
                .jpeg({quality: 60})
                .toBuffer();
            
            const imageIndex = foundImages.length;
            const thumbnailImage = `data:image/jpeg;base64,${thumbnailBuffer.toString('base64')}`;
            foundImages.push({
                id,
                fullFileName,
                path,
                name: namePart,
                extension,
                tags,
                preview: thumbnailImage
            });

            for(const tag of tags)
            {
                imageTagLookup[tag] = [...(imageTagLookup[tag] ?? []), imageIndex];
            }
            if(tags.length == 0)
            {
                imageTagLookup[''].push(imageIndex);
            }
            imageLookup[id] = imageIndex;
        }
    }
}

const inventoryImages = async () => {
    status = 'processing';
    try 
    {
        const dir = await fs.opendir(sourceDir);
        for await (const dirent of dir)
        {
          iterateDirectory(dirent, sourceDir);
        }
        status = 'done';
    } 
    catch (err) 
    {
        status = 'error';
        console.error(err);
    }
};

app.get( "/api/status", ( req, res ) => {
    res.header('content-type', 'application/json');
    res.send( JSON.stringify(status) );
} );

app.get( "/api/images", ( req, res ) => {
    res.header('content-type', 'application/json');
    res.send( JSON.stringify(foundImages) );
} );

app.get( "/api/tags", ( req, res ) => {
    res.header('content-type', 'application/json');
    res.send( JSON.stringify(imageTagLookup) );
} );

app.get( "/api/images/:imageId", async (req, res) => {
    const idx = imageLookup[req.params.imageId];
    const image = foundImages[idx];
    const buffer = await sharp(image.fullFileName)
        .png()
        .toBuffer();
    res.header('content-type', 'image/png');
    res.send(buffer);
});

// start the Express server
app.listen( port, () => {
    console.log( `server started at http://localhost:${ port }` );
} );

inventoryImages();