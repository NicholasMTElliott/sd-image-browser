import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageThumbnail } from "./ImageThumbnail";
import { ISDImage } from "./ISDImage";
import { SelectableTag } from "./SelectableTag";


export default function App() {
  const [images, setImages] = useState<ISDImage[]>([]);
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState<'name'|'mtime'>('name');
  const [tags, setTags] = useState<{[key: string]: number[]}>({});

  const fetchSequenceCount = useRef(1);
  const fetchData = useCallback(async () => {
    const sequence = fetchSequenceCount.current+1;
    fetchSequenceCount.current = sequence;
    const imageTask = await fetch('/api/images');
    const tagTask = await fetch('/api/tags');

    const images = await (await imageTask).json();
    const tags = await(await tagTask).json();

    if(sequence === fetchSequenceCount.current)
    {
      setImages(images);
      setTags(tags); 
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const deleteSequenceCount = useRef(1);
  const onDelete = useCallback(async (id: string) => {
    const sequence = deleteSequenceCount.current+1;
    deleteSequenceCount.current = sequence;

    // pre-strip out this item
    setViewingImage(undefined);
    setImages(images.filter(img => img.id !== id));
    await fetch(`/api/images/${id}`, { method: 'delete' });
    if(deleteSequenceCount.current === sequence)
    {
      fetchData();
    }
  }, [fetchData, images]);
  

  const [selectedTags, setSelectedTags] = useState<{[key: string]: boolean}>({});
  const showAllTags = Object.keys(selectedTags).filter(tagName => selectedTags[tagName]).length === 0;
  const [selectedImage, setSelectedImage] = useState<number>();
  const [viewingImage, setViewingImage] = useState<string>();


  const sortedImages = useMemo(() => {
    if(sortBy === 'name')
    {
      // eslint-disable-next-line no-nested-ternary
      return images.sort((a,b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0 )
    }
    
    // eslint-disable-next-line no-nested-ternary
    return images.sort((a,b) => a.modified < b.modified ? -1 : a.modified > b.modified ? 1 : 0 )
  }, [images, sortBy]);

  const filteredImages = useMemo(() => {
    if(showAllTags)
    {
      return sortedImages;
    }
      
    return sortedImages.filter(image => image.tags.filter(tagName => selectedTags[tagName]).length > 0);
  }, [sortedImages, showAllTags, selectedTags]);

  const sortByName = useCallback(()=>setSortBy('name'), []);
  const sortByDate = useCallback(()=>setSortBy('mtime'), []);

  const onNext = useCallback(() => {
    if(selectedImage === undefined)
      return;

    const index = selectedImage;
    console.error(`Current index is ${index}`);
    const nextIndex = (index+1)%filteredImages.length;
    console.error(`Next index is ${nextIndex}`);
    const nextImage = filteredImages[nextIndex].id;
    console.error(`Next image is ${nextImage}`);
    setSelectedImage(nextIndex);
    setViewingImage(nextImage);
  }, [selectedImage, filteredImages]);


  const onPrev = useCallback(() => {
    if(selectedImage === undefined)
      return;

    const index = selectedImage;
    const prevIndex = index === 0 ? filteredImages.length-1 : index - 1;
    const prevImage = filteredImages[prevIndex].id;
    setSelectedImage(prevIndex);
    setViewingImage(prevImage);
  }, [selectedImage, filteredImages]);

  const filteredTags = useMemo(() => Object.keys(tags)
    .filter(tagName => filter.length === 0 || tagName.indexOf(filter) >= 0)
    .sort(), 
  [tags, filter]);

  
  useEffect(() => {
    const handleKeys = (event: any) => {
       if (event.keyCode === 37) {
        onPrev();
        event.preventDefault();
      }
      else if (event.keyCode === 39) {
       onNext();
       event.preventDefault();
      }
      else if (viewingImage && event.keyCode === 68) {
        onDelete(viewingImage);
        event.preventDefault();
      }
      else
      {
        console.error(`Other key: keyCode ${event.keyCode} key ${event.key}`, event.keyCode, event.key);
      }
    };

    window.addEventListener('keydown', handleKeys);

    return () => {
      window.removeEventListener('keydown', handleKeys);
    };
  }, [onNext, onPrev, onDelete, viewingImage]);

  const onSelect = useCallback((imageId: string) => {
    const imageIndex = filteredImages.findIndex(img => img.id === imageId);
    setSelectedImage(imageIndex);
    setViewingImage(imageId);
  }, [filteredImages]);

  const viewingImageRef = useMemo(() => images.find(i => i.id === viewingImage), [images, viewingImage]);

  return <div id='browser-page'>
    <div id='tabs'>
      [ Text Prompts ] [ Image to Image ] [ Outputs ]
    </div>
    <div id='manager'>
      <div id='taglist'>{
        filteredTags.map(tagName => <SelectableTag key={tagName} tagName={tagName} selectedTags={selectedTags} setSelectedTags={setSelectedTags} />)
      }
      </div>
      <input type='text' value={filter} onChange={(evt) => setFilter(evt.currentTarget.value)}/>
    </div>
    <div id='browser'>
      <div id='toolbar'>
        <label htmlFor="radSortByName"><input id='radSortByName' type='radio' checked={sortBy === 'name'} onClick={sortByName}/>Name</label>
        <label htmlFor="radSortByDate"><input id='radSortByDate' type='radio' checked={sortBy === 'mtime'} onClick={sortByDate}/>Date</label>
        <button type='button'>Select</button>
        <button type='button'>Upvote</button>
        <button type='button'>Downvote</button>
        <button type='button'>Delete</button>
      </div>
      {
        filteredImages.map((image, idx) => (
          <ImageThumbnail 
            key={image.id}  
            image={image} 
            onSelect={onSelect}
            isSelected={selectedImage === idx} />
        ))
      }
    </div>
    <div id='view-container' className={viewingImage && 'visible'}>
      <button id='close-view-container-button' type='button' onClick={() => setViewingImage(undefined)}>X</button>
      <div id='view-taglist'>
        <div>{images.find(i => i.id === viewingImage)?.name}</div>
        <div>{viewingImageRef ? new Date(viewingImageRef.modified).toLocaleString() : ''}</div>
        {
          viewingImageRef?.tags.map(tag => <div key={tag} className="view-taglist-tag">{tag}</div>)
        }
      </div>
      <div id='view-image' style={{backgroundImage: `url(/api/images/${viewingImage})`}} title={viewingImageRef?.name}/>
    </div>
  </div>;
}

