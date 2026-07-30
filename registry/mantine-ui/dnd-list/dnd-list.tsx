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
import { Text } from "@mantine/core";
import { useListState } from "@mantine/hooks";
import cx from "clsx";
import type { CSSProperties, ReactNode } from "react";

import classes from "./dnd-list.module.css";

export interface DndListItem {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
}

export interface DndListProps {
  initialItems: DndListItem[];
  onChange?: (items: DndListItem[]) => void;
}

interface SortableItemProps {
  item: DndListItem;
}

function SortableItem({ item }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cx(classes.item, { [classes.itemDragging]: isDragging })}
      {...attributes}
      {...listeners}
    >
      {item.leading && <div className={classes.leading}>{item.leading}</div>}
      <div>
        <Text>{item.label}</Text>
        {item.description && (
          <Text className={classes.description} size="sm">
            {item.description}
          </Text>
        )}
      </div>
    </div>
  );
}

export function DndList({ initialItems, onChange }: DndListProps) {
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
          <SortableItem key={item.id} item={item} />
        ))}
      </SortableContext>
    </DndContext>
  );
}
