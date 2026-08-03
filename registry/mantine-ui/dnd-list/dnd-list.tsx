/**
 * Adapted from Mantine UI's DndList at
 * ffbf61c559f374a7ea28fcf00355e84dcbe9a908. MIT licensed; see
 * LICENSES/MANTINE-UI.txt after installation.
 */

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  type Factory,
  factory,
  type StylesApiProps,
  Text,
  useProps,
  useStyles,
} from "@mantine/core";
import { useListState } from "@mantine/hooks";
import cx from "clsx";
import type { ReactNode } from "react";

import classes from "./dnd-list.module.css";

export interface DndListItem {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
}

/**
 * DndList renders no wrapper element of its own — `DndContext`/`SortableContext`
 * are context providers, not DOM nodes, and the component's top-level output is
 * the bare list of per-item `<div>`s. There is therefore no `root` selector:
 * every selector here names a part of the repeated item row instead.
 */
export type DndListStylesNames = "item" | "itemSection" | "itemLabel" | "itemDescription";

export interface DndListProps extends StylesApiProps<DndListFactory> {
  initialItems: DndListItem[];
  onChange?: (items: DndListItem[]) => void;
}

export type DndListFactory = Factory<{
  props: DndListProps;
  stylesNames: DndListStylesNames;
}>;

interface SortableItemProps {
  item: DndListItem;
  getStyles: ReturnType<typeof useStyles<DndListFactory>>;
}

function SortableItem({ item, getStyles }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const itemStyles = getStyles("item");

  return (
    <div
      ref={setNodeRef}
      {...itemStyles}
      className={cx(itemStyles.className, { [classes.itemDragging]: isDragging })}
      // dnd-kit's transform/transition are mandatory for drag positioning and must
      // always win; they're applied last so a consumer's `styles={{ item: {...} }}`
      // can still set any other CSS property on this element.
      style={{
        ...itemStyles.style,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...attributes}
      {...listeners}
    >
      {item.leading && <div {...getStyles("itemSection")}>{item.leading}</div>}
      <div>
        <Text {...getStyles("itemLabel")}>{item.label}</Text>
        {item.description && (
          <Text {...getStyles("itemDescription")} size="sm">
            {item.description}
          </Text>
        )}
      </div>
    </div>
  );
}

export const DndList = factory<DndListFactory>((_props) => {
  const props = useProps("DndList", null, _props);
  const { classNames, styles, unstyled, vars, attributes, initialItems, onChange } = props;

  const getStyles = useStyles<DndListFactory>({
    name: "DndList",
    classes,
    props,
    classNames,
    styles,
    unstyled,
    attributes,
    vars,
  });

  const [items, handlers] = useListState(initialItems);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;

    const previousIndex = items.findIndex((item) => item.id === active.id);
    const nextIndex = items.findIndex((item) => item.id === over.id);
    if (previousIndex === -1 || nextIndex === -1) return;

    const reordered = arrayMove(items, previousIndex, nextIndex);
    handlers.setState(reordered);
    onChange?.(reordered);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <SortableItem key={item.id} item={item} getStyles={getStyles} />
        ))}
      </SortableContext>
    </DndContext>
  );
});

DndList.classes = classes;
DndList.displayName = "DndList";

export namespace DndList {
  export type Props = DndListProps;
  export type StylesNames = DndListStylesNames;
  export type Factory = DndListFactory;
}
