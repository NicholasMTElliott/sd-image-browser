import React, { useCallback, useState } from "react";
import { ISDImage } from "./ISDImage";

/**
 * Displays a selectable thumbnail of an image with loading state handling
 */
export const ImageThumbnail = React.memo((props: { 
    image: ISDImage; 
    isSelected: boolean;
    onSelect: (id: string) => void;
  }) => {
  const { isSelected, image, onSelect } = props;
  const [hasError, setHasError] = useState(false);

  const onClick = useCallback(() => {
    console.log(`Thumbnail selected: ${image.id}`);
    onSelect(image.id);
  }, [onSelect, image.id]);

  const onError = useCallback(() => {
    console.error(`Failed to load thumbnail: ${image.id}`);
    setHasError(true);
  }, [image.id]);

  return <button
    type="button"
    onClick={onClick}
    title={image.name}
    className={`image-container ${isSelected ? 'selected' : ''} ${hasError ? 'error' : ''}`}
    key={image.id}>
    <img 
      className='image-preview' 
      alt={image.name} 
      src={`/api/thumbnails/${image.id}`} 
      onError={onError}
      loading="lazy" />
  </button>;
});
