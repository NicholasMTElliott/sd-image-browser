import { useCallback } from "react";
import { ISDImage } from "./ISDImage";

export function ImageThumbnail(props: { 
    image: ISDImage; 
    isSelected: boolean;
    onSelect: (id: string) => any;
  }) {
  const { isSelected, image, onSelect } = props;
  const onClick = useCallback(() => {
    onSelect(image.id);
  },
    [onSelect, image.id]);

  return <button
    type="button"
    onClick={onClick}
    className={`image-container ${isSelected && 'selected'}`}
    key={image.id}>
    <img className='image-preview' alt={image.name} src={image.preview} />
  </button>;
}
