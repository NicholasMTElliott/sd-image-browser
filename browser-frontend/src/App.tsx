import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageThumbnail } from "./ImageThumbnail";
import { ISDImage } from "./ISDImage";
import { SelectableTag } from "./SelectableTag";


export default function App() {
  const [images, setImages] = useState<ISDImage[]>([]);
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState<'name'|'mtime'>('name');
  const [direction, setDirection] = useState<'up'|'down'>('up');
  const [tags, setTags] = useState<{[key: string]: number[]}>({});

  const [selectedTags, setSelectedTags] = useState<{[key: string]: boolean}>({});
  const showAllTags = Object.keys(selectedTags).filter(tagName => selectedTags[tagName]).length === 0;
  const [selectedImage, setSelectedImage] = useState<number>();
  const [viewingImage, setViewingImage] = useState<string>();

  const fetchData = useFetchData(setImages, setTags);

  // on mount, fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredImages = useFilteredAndSortedImages(sortBy, images, direction, showAllTags, selectedTags);

  const { onPrev, onNext } = useOnNavigation(selectedImage, filteredImages, setSelectedImage, viewingImage, setViewingImage);

  const filteredTags = useMemo(() => Object.keys(tags)
    .filter(tagName => filter.length === 0 || tagName.indexOf(filter) >= 0)
    .sort(), 
  [tags, filter]);
  
  const onPin = useCallback(async () => {
    if(selectedImage === undefined)
    {
      return;
    }
    const {id} = filteredImages[selectedImage];

    // pre-strip out this item
    await fetch(`/api/images/${id}/pin`, { method: 'put' });
  }, [filteredImages, selectedImage]);

  const deleteSequenceCount = useRef(1);
  const onDelete = useCallback(async () => {
    if(selectedImage === undefined)
    {
      return;
    }

    const sequence = deleteSequenceCount.current+1;
    deleteSequenceCount.current = sequence;

    const {id} = filteredImages[selectedImage];

    // pre-strip out this item
    setViewingImage(undefined);
    setImages(images.filter(img => img.id !== id));
    await fetch(`/api/images/${id}`, { method: 'delete' });
    if(deleteSequenceCount.current === sequence)
    {
      fetchData();
    }
  }, [fetchData, filteredImages, images, selectedImage]);

  useKeyboardHandlers(onPrev, onNext, onDelete, selectedImage, setViewingImage, filteredImages, onPin, viewingImage);

  const onSelect = useCallback((imageId: string) => {
    const imageIndex = filteredImages.findIndex(img => img.id === imageId);
    setSelectedImage(imageIndex);
    setViewingImage(imageId);
  }, [filteredImages]);

  const viewingImageRef = useMemo(() => images.find(i => i.id === viewingImage), [images, viewingImage]);

  const sortByName = useCallback(() => {
    if(sortBy === 'name')
    {
      if(direction === 'up')
      {
        setDirection('down');
      }
      else
      {
        setDirection('up');
      }
    }
    else
    {
      setSortBy('name');
      setDirection('up');
    }
  }, [direction, sortBy]);

  const sortByDate = useCallback(() => {
    if(sortBy === 'mtime')
    {
      if(direction === 'up')
      {
        setDirection('down');
      }
      else
      {
        setDirection('up');
      }
    }
    else
    {
      setSortBy('mtime');
      setDirection('up');
    }
  }, [direction, sortBy]);


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
        <button type="button" onClick={fetchData}>Refresh</button>
        <button type="button" onClick={sortByName}>Name {sortBy === 'name' && direction}</button>
        <button type="button" onClick={sortByDate}>Date {sortBy === 'mtime' && direction}</button>
        <button type='button' onClick={onDelete}>Delete</button>
      </div>
      {
        filteredImages.map((image, idx) => (
          <ImageThumbnail 
            key={`${image.name}.${image.id}`}  
            image={image} 
            onSelect={onSelect}
            isSelected={selectedImage === idx} />
        ))
      }
    </div>
    <div id='view-container' className={viewingImage && 'visible'}>
      <button id='close-view-container-button' type='button' onClick={() => setViewingImage(undefined)}>X</button>
      <div id='view-taglist'>
        <div>{viewingImageRef?.name}</div>
        <div>{viewingImageRef?.path}</div>
        <div>{viewingImageRef ? new Date(viewingImageRef.modified).toLocaleString() : ''}</div>
        {
          viewingImageRef?.tags.map(tag => <div key={tag} className="view-taglist-tag">{tag}</div>)
        }
      </div>
      <div id='view-image' style={{backgroundImage: `url(/api/images/${viewingImage})`}} title={viewingImageRef?.name}/>
    </div>
  </div>;
}

function useKeyboardHandlers(onPrev: () => void, onNext: () => void, onDelete: () => Promise<void>, selectedImage: number | undefined, setViewingImage, filteredImages: ISDImage[], onPin: () => Promise<void>, viewingImage: string | undefined) {
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
      else if (event.keyCode === 68) {
        onDelete();
        event.preventDefault();
      }
      else if (event.keyCode === 32 && selectedImage !== undefined) {
        setViewingImage(filteredImages[selectedImage].id);
        event.preventDefault();
      }
      else if (event.keyCode === 80 && selectedImage !== undefined) {
        onPin();
        event.preventDefault();
      }
      else if (event.keyCode === 27) {
        setViewingImage(undefined);
      }
      else {
        console.error(`Other key: keyCode ${event.keyCode} key ${event.key}`, event.keyCode, event.key);
      }
    };

    window.addEventListener('keydown', handleKeys);

    return () => {
      window.removeEventListener('keydown', handleKeys);
    };
  }, [onNext, onPrev, onDelete, viewingImage, selectedImage, filteredImages, onPin, setViewingImage]);
}

function useOnNavigation(selectedImage: number | undefined, filteredImages: ISDImage[], setSelectedImage: (v:number) => any, viewingImage: string | undefined, setViewingImage: (v:string) => any) {
  const onNext = useCallback(() => {
    if (selectedImage === undefined)
      return;

    const index = selectedImage;
    console.error(`Current index is ${index}`);
    const nextIndex = (index + 1) % filteredImages.length;
    console.error(`Next index is ${nextIndex}`);
    const nextImage = filteredImages[nextIndex].id;
    console.error(`Next image is ${nextImage}`);
    setSelectedImage(nextIndex);
    if (viewingImage !== undefined) {
      setViewingImage(nextImage);
    }
  }, [selectedImage, filteredImages, setSelectedImage, viewingImage, setViewingImage]);


  const onPrev = useCallback(() => {
    if (selectedImage === undefined)
      return;

    const index = selectedImage;
    const prevIndex = index === 0 ? filteredImages.length - 1 : index - 1;
    const prevImage = filteredImages[prevIndex].id;
    setSelectedImage(prevIndex);
    if (viewingImage !== undefined) {
      setViewingImage(prevImage);
    }
  }, [selectedImage, filteredImages, setSelectedImage, viewingImage, setViewingImage]);
  return { onPrev, onNext };
}

function useFilteredAndSortedImages(sortBy: string, images: ISDImage[], direction: string, showAllTags: boolean, selectedTags: { [key: string]: boolean; }) {
  const sortedImages = useMemo(() => {
    let sorted;
    if (sortBy === 'name') {
      // eslint-disable-next-line no-nested-ternary
      sorted = images.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    }

    else {

      // eslint-disable-next-line no-nested-ternary
      sorted = images.sort((a, b) => a.modified < b.modified ? -1 : a.modified > b.modified ? 1 : 0);
    }
    if (direction === 'down') {
      sorted = sorted.reverse();
    }

    return sorted;
  }, [images, sortBy, direction]);

  const filteredImages = useMemo(() => {
    if (showAllTags) {
      return sortedImages;
    }

    return sortedImages.filter(image => image.tags.filter(tagName => selectedTags[tagName]).length > 0);
  }, [sortedImages, showAllTags, selectedTags]);
  return filteredImages;
}

function useFetchData(setImages: (v: any) => any, setTags: (v: any) => any) {
  const fetchSequenceCount = useRef(1);
  const fetchData = useCallback(async () => {
    const sequence = fetchSequenceCount.current + 1;
    fetchSequenceCount.current = sequence;
    const imageTask = await fetch('/api/images');
    const tagTask = await fetch('/api/tags');

    const images = await imageTask.json();
    const tags = await tagTask.json();

    if (sequence === fetchSequenceCount.current) {
      setImages(images);
      setTags(tags);
    }
  }, [setImages, setTags]);
  return fetchData;
}

