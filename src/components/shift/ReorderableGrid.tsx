import { useMemo } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

export type ReorderItem = { id: string; name: string };

export function ReorderableGrid({
  items,
  columns = 2,
  onReorder,
}: {
  items: ReorderItem[];
  columns?: 1 | 2;
  onReorder: (nextIds: string[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  );

  const ids = useMemo(() => items.map((i) => i.id), [items]);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(ids, oldIndex, newIndex));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className={"grid gap-2 " + (columns === 1 ? "grid-cols-1" : "grid-cols-2")}>
          {items.map((it) => (
            <SortableChip key={it.id} id={it.id} name={it.name} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableChip({ id, name }: { id: string; name: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 10 : "auto",
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-xl border-2 border-dashed border-primary/50 bg-primary/5 px-3 py-4 text-sm font-medium text-foreground touch-none select-none"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
    </div>
  );
}