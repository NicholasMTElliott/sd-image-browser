/* eslint-disable no-plusplus */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { uniq } from 'lodash';
import { ImageThumbnail } from "./ImageThumbnail";
import { ISDImage } from "./ISDImage";
import { SelectableTag } from "./SelectableTag";


export default function App() {
  const [images, setImages] = useState<ISDImage[]>([]);
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState<'name'|'mtime'>('name');
  const [direction, setDirection] = useState<'up'|'down'>('up');
  const [tags, setTags] = useState<{[key: string]: number[]}>({});
  const [status, setStatus] = useState<string>('Unknown');

  const [loading, setLoading] = useState(0);
  const startLoading = useCallback(() => setLoading((prev) => prev + 1), []);
  const endLoading = useCallback(() => setLoading((prev) => prev - 1), []);
  const isLoading = loading > 0;

  const [selectedTags, setSelectedTags] = useState<{[key: string]: boolean}>({});
  const showAllTags = Object.keys(selectedTags).filter(tagName => selectedTags[tagName]).length === 0;
  const [selectedImage, setSelectedImage] = useState<number>();
  const [viewingImage, setViewingImage] = useState<string>();

  const fetchData = useFetchData(setImages, setTags, setStatus, startLoading, endLoading);

  // on mount, fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const [prefix, setPrefix] = useState('');
  const prefixes = useMemo(() => {
    const prefixlist = images.reduce((collection, img) => {
      const parts = img.path.split('/');
      for(let i = 0; i < parts.length; i += 1)
      {
        if(collection.length <= i)
        {
          collection.push([parts[i]]);
        }
        else
        {
          collection[i].push(parts[i]);
        }
      }
      return collection;
    }, [] as string[][]);
    
    let prefix = '';
    let splits: string[] = [];
    for(let i = 0; i < prefixlist.length; i += 1)
    {
      const items = uniq(prefixlist[i]);
      if(items.length === 1)
      {
        prefix += `${items[0]}/`;
      }
      else
      {
        splits = items;
        break;
      }
    }
    return splits.map(s => prefix + s).sort();
  }, [images]);
  const filteredImages = useFilteredAndSortedImages(sortBy, images, direction, showAllTags, selectedTags, prefix);
  const filteredTags = useMemo(() => Object.keys(tags)
    .filter(tagName => filter.length === 0 || tagName.indexOf(filter) >= 0)
    .sort(), 
  [tags, filter]);

  const { onPrev, onNext } = useOnNavigation(selectedImage, filteredImages, setSelectedImage, viewingImage, setViewingImage);

  
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

  const onRescan = useCallback(() => {
    fetch('/api/images', { method: 'post' });
  }, []);

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
      {
        prefixes.map(p => <button type="button" onClick={() => setPrefix(p)}>{p}</button>)        
      }
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
        <div>{isLoading ? 'Refreshing...' : status}</div>
        <button type="button" onClick={fetchData}>Refresh</button>
        <button type="button" onClick={sortByName}>Name {sortBy === 'name' && direction}</button>
        <button type="button" onClick={sortByDate}>Date {sortBy === 'mtime' && direction}</button>
        <button type='button' onClick={onDelete}>Delete</button>
        <button type="button" onClick={onRescan}>Rescan</button>
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
      <div id='view-tools'>
        <button type='button' onClick={onPrev}>{'<'}</button>
        <button type='button' onClick={onNext}>{'>'}</button>
        <button type='button' onClick={onPin}>+</button>
        <button type='button' onClick={onDelete}>-</button>
        <button id='close-view-container-button' type='button' onClick={() => setViewingImage(undefined)}>X</button>
      </div>
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

function useKeyboardHandlers(onPrev: () => void, onNext: () => void, onDelete: () => Promise<void>, selectedImage: number | undefined, setViewingImage: (v:string | undefined) => any, filteredImages: ISDImage[], onPin: () => Promise<void>, viewingImage: string | undefined) {
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

function useFilteredAndSortedImages(sortBy: string, images: ISDImage[], direction: string, showAllTags: boolean, selectedTags: { [key: string]: boolean; }, prefix: string) {
  const filteredImages = useMemo(() => images.filter(image => (showAllTags || image.tags.filter(tagName => selectedTags[tagName]).length > 0) && image.path.indexOf(prefix) === 0), [showAllTags, images, prefix, selectedTags]);
  
  const sortedImages = useMemo(() => {
    let sorted;
    if (sortBy === 'name') {
      // eslint-disable-next-line no-nested-ternary
      sorted = filteredImages.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    }

    else {

      // eslint-disable-next-line no-nested-ternary
      sorted = filteredImages.sort((a, b) => a.modified < b.modified ? -1 : a.modified > b.modified ? 1 : 0);
    }
    if (direction === 'down') {
      sorted = sorted.reverse();
    }

    return sorted;
  }, [filteredImages, sortBy, direction]);
  return sortedImages;
}

function useFetchData(setImages: (v: any) => any, setTags: (v: any) => any, setStatus: (v:string) => any, startLoading: () => any, endLoading: () => any) {
  const fetchSequenceCount = useRef(1);
  const fetchData = useCallback(async () => {
    startLoading();
    try
    {
      const sequence = fetchSequenceCount.current + 1;
      fetchSequenceCount.current = sequence;
      const imageTask = await fetch('/api/images');
      const tagTask = await fetch('/api/tags');
      const statusTask = await fetch('/api/status');

      const images = await imageTask.json();
      const tags = await tagTask.json();
      const status = await statusTask.json();

      if (sequence === fetchSequenceCount.current) {
        setImages(images);
        setTags(tags);
        setStatus(status)
      }
    }
    finally
    {
      endLoading();
    }
  }, [endLoading, setImages, setStatus, setTags, startLoading]);
  return fetchData;
}

