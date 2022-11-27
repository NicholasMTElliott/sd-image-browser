import { useCallback, useEffect, useState } from "react";
import { ImageThumbnail } from "./ImageThumbnail";
import { ISDImage } from "./ISDImage";
import { SelectableTag } from "./SelectableTag";

export default function App() {
  const [images, setImages] = useState<ISDImage[]>([]);
  const [imageLookup, setImageLookup] = useState<{[key:string]: number}>({});
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const execute = async() => {
      const response = await fetch('/api/images');
      const images: ISDImage[] = await response.json();
      setImages(images);
      setImageLookup(images.reduce((collection, image, index) => ({...collection, [image.id]: index}), {} as {[key:string]: number}));
    };
    execute();
  }, []);


  const [tags, setTags] = useState<{[key: string]: number[]}>({});
  useEffect(() => {
    const execute = async() => {
      const response = await fetch('/api/tags');
      setTags(await response.json());
    };
    execute();
  }, []);
  

  const [selectedTags, setSelectedTags] = useState<{[key: string]: boolean}>({});
  const showAllTags = Object.keys(selectedTags).filter(tagName => selectedTags[tagName]).length === 0;
  const [selectedImage, setSelectedImage] = useState<string>();
  const [viewingImage, setViewingImage] = useState<string>();

  const onNext = useCallback(() => {
    if(!viewingImage?.length)
      return;
    let index = imageLookup[viewingImage];
    const nextImage = images[(index+1)%images.length].id;
    setSelectedImage(nextImage);
    setViewingImage(nextImage);
  }, [viewingImage, imageLookup, images]);


  const onPrev = useCallback(() => {
    if(!viewingImage?.length)
      return;
    let index = imageLookup[viewingImage];
    let prevIndex = index === 0 ? images.length-1 : index - 1;
    const prevImage = images[prevIndex].id;
    setSelectedImage(prevImage);
    setViewingImage(prevImage);
  }, [viewingImage, imageLookup, images]);

  useEffect(() => {
    const handleLeft = (event: any) => {
       if (event.keyCode === 37) {
        onPrev();
      }
    };
    const handleRight = (event: any) => {
      if (event.keyCode === 39) {
       onNext();
     }
    };
    window.addEventListener('keydown', handleLeft);
    window.addEventListener('keydown', handleRight);

    return () => {
      window.removeEventListener('keydown', handleLeft);
      window.removeEventListener('keydown', handleRight);
    };
  }, [onNext, onPrev]);

  return <div id='browser-page'>
    <div id='tabs'>
      [ Text Prompts ] [ Image to Image ] [ Outputs ]
    </div>
    <div id='manager'>
      <div id='taglist'>{
        Object.keys(tags)
          .filter(tagName => filter.length === 0 || tagName.indexOf(filter) >= 0)
          .sort()
          .map(tagName => <SelectableTag key={tagName} tagName={tagName} selectedTags={selectedTags} setSelectedTags={setSelectedTags} />)
      }
      </div>
      <input type='text' value={filter} onChange={(evt) => setFilter(evt.currentTarget.value)}/>
    </div>
    <div id='browser'>
      <div id='toolbar'>
        <button type='button'>Select</button>
        <button type='button'>Upvote</button>
        <button type='button'>Downvote</button>
        <button type='button'>Delete</button>
      </div>
      {
        images
          .filter(image => showAllTags || image.tags.filter(tagName => selectedTags[tagName]).length > 0)
          .map(image => (
          <ImageThumbnail key={image.id} setSelectedImage={setSelectedImage} image={image} setViewingImage={setViewingImage} selectedImage={selectedImage} />
        ))
      }
    </div>
    <div id='view-container' className={viewingImage && 'visible'}>
      <button id='close-view-container-button' type='button' onClick={() => setViewingImage(undefined)}>X</button>
      <div id='view-taglist'>
        {
          images[imageLookup[viewingImage ?? '']]?.tags.map(tag => <div className="view-taglist-tag">{tag}</div>)
        }
      </div>
      <div id='view-image' style={{backgroundImage: `url(/api/images/${viewingImage})`}} title={images[imageLookup[viewingImage ?? '']]?.name}/>
    </div>
  </div>;
}

