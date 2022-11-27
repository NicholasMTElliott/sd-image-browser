import { useCallback } from "react";

export function SelectableTag(props: { tagName: string; selectedTags: any; setSelectedTags: any; }) {
  const { tagName, selectedTags, setSelectedTags } = props;
  const onClick = useCallback(() => {
    setSelectedTags({ ...selectedTags, [tagName]: !selectedTags[tagName] });
  }, [tagName, selectedTags, setSelectedTags]);

  return <label key={tagName} htmlFor={tagName}>
    <input id={tagName} key={tagName} type="checkbox" onClick={onClick} />
    {tagName || '[None]'}
  </label>;
}
