import { closestCenter, pointerWithin, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDndContext, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus } from "lucide-react";
import { motion } from "motion/react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import type { Appearance, Card, ChromaConfig, Section, Tab } from "../../shared/config";
import { createSection, findCard, moveCard } from "../../shared/operations";
import { resolveAppearance, resolveTabAppearance } from "../../shared/presentation";
import { cn } from "../lib/cn";
import { CardRenderer } from "../registries/card-registry";
import { LayoutRenderer } from "../registries/layout-registry";
import { useEditorStore } from "../store/editor-store";
import { VisualIcon } from "./visual-icon";
import { bentoBoxStyle } from "./bento-grid";

type DragData =
  | { kind: "tab"; tabId: string }
  | { kind: "canvas"; tabId: string }
  | { kind: "section"; tabId: string; sectionId: string }
  | { kind: "card"; tabId: string; sectionId: string; cardId: string };

function cardStyle(appearance: Required<Appearance>): CSSProperties {
  return {
    "--card-accent": appearance.accent,
    "--icon-size": `${appearance.iconSize}px`,
    "--description-display": appearance.showDescription ? "-webkit-box" : "none"
  } as CSSProperties;
}

function SortableTab({ tab, active, editing, accent }: { tab: Tab; active: boolean; editing: boolean; accent: string }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: `tab:${tab.id}`, data: { kind: "tab", tabId: tab.id } satisfies DragData, disabled: !editing });
  const setActiveTab = useEditorStore((state) => state.setActiveTab);
  const select = useEditorStore((state) => state.select);
  const { over, active: dragged } = useDndContext();
  const targeted = over?.id === `tab:${tab.id}` && dragged?.id !== `tab:${tab.id}`;
  return <motion.button layout ref={setNodeRef} data-testid={`tab-${tab.id}`} aria-current={active ? "page" : undefined} style={{ transform: CSS.Transform.toString(transform), transition, touchAction: editing ? "none" : undefined }} {...(editing ? attributes : {})} {...(editing ? listeners : {})} type="button" onClick={() => { setActiveTab(tab.id); if (editing) select({ type: "tab", tabId: tab.id }); }} className={cn("dashboard-tab relative flex h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-medium transition", active ? "bg-white/12 text-white shadow-inner ring-1 ring-white/10" : "text-slate-400 hover:bg-white/6 hover:text-slate-200", editing && "cursor-grab active:cursor-grabbing", targeted && "ring-2 ring-emerald-400 bg-emerald-400/10", isDragging && "opacity-30")}>
    <span className="shrink-0" style={{ color: active ? accent : undefined }}><VisualIcon icon={tab.icon} className="size-[18px]" /></span><span className="truncate">{tab.label}</span>{active && <motion.span layoutId="active-tab" style={{ backgroundColor: accent }} className="active-tab-indicator absolute" />}
  </motion.button>;
}

function SortableCard({ card, tabId, section, editing, appearance }: { card: Card; tabId: string; section: Section; editing: boolean; appearance: Required<Appearance> }) {
  const sectionId = section.id;
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: `card:${card.id}`, data: { kind: "card", tabId, sectionId, cardId: card.id } satisfies DragData, disabled: !editing });
  const selection = useEditorStore((state) => state.selection);
  const select = useEditorStore((state) => state.select);
  const selected = selection?.type === "card" && selection.cardId === card.id;
  return <motion.article layout data-surface={appearance.surface} data-density={appearance.density} data-testid={`card-${card.id}`} ref={setNodeRef} style={{ ...cardStyle(appearance), ...(section.layout.type === "bento" ? bentoBoxStyle(card) : {}), transform: CSS.Transform.toString(transform), transition, touchAction: editing ? "none" : undefined }} {...(editing ? attributes : {})} {...(editing ? listeners : {})} onClick={(event) => { if (editing) { event.preventDefault(); select({ type: "card", tabId, sectionId, cardId: card.id }); } }} className={cn("chroma-link-card relative overflow-hidden rounded-[22px]", editing && "cursor-grab ring-offset-2 ring-offset-[#090b13] active:cursor-grabbing", selected && "ring-2 ring-violet-400/55", isDragging && "opacity-20")}>
    {editing && <GripVertical className="absolute right-2 top-2 size-4 text-slate-600" />}<CardRenderer card={card} editing={editing} />
  </motion.article>;
}

function SortableSection({ section, tab, homepage, editing }: { section: Section; tab: Tab; homepage: ChromaConfig["homepage"]; editing: boolean }) {
  const tabId = tab.id;
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: `section:${section.id}`, data: { kind: "section", tabId, sectionId: section.id } satisfies DragData, disabled: !editing });
  const { over } = useDndContext();
  const overData = over?.data.current as DragData | undefined;
  const isOver = overData && "sectionId" in overData && overData.sectionId === section.id;
  const selection = useEditorStore((state) => state.selection);
  const select = useEditorStore((state) => state.select);
  const selected = selection?.type === "section" && selection.sectionId === section.id;
  return <motion.section layout ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} data-width={section.width ?? "full"} data-testid={`section-${section.id}`} onClick={(event) => { if (editing && event.target === event.currentTarget) select({ type: "section", tabId, sectionId: section.id }); }} className={cn("dashboard-section min-w-0 rounded-[26px] py-2 transition", editing && "border border-dashed border-white/12 p-4", selected && "border-violet-400/60 bg-violet-500/[.04]", isOver && editing && "border-emerald-400/70 bg-emerald-400/[.06]", isDragging && "opacity-30")}>
    <div className="mb-4 flex items-center gap-2"><h2 onClick={() => editing && select({ type: "section", tabId, sectionId: section.id })} className="text-sm font-semibold uppercase tracking-[.14em] text-slate-400">{section.title}</h2>{editing && <button type="button" aria-label="Drag section" title="Drag to reorder or move to another tab" className="touch-none cursor-grab rounded-md p-1 text-slate-400 hover:bg-white/10" {...attributes} {...listeners}><GripVertical className="size-4" /></button>}</div>
    <SortableContext items={section.cards.map((card) => `card:${card.id}`)} strategy={rectSortingStrategy}>
      <LayoutRenderer layout={section.layout}>{section.cards.map((card) => <SortableCard key={card.id} card={card} tabId={tabId} section={section} editing={editing} appearance={resolveAppearance(card, section, tab, homepage)} />)}{editing && section.cards.length === 0 && <button type="button" onClick={() => select({ type: "section", tabId, sectionId: section.id })} className="grid min-h-20 place-items-center rounded-2xl border border-dashed border-white/10 text-sm text-slate-600"><span className="flex items-center gap-2"><Plus className="size-4" />Select section, then add a link</span></button>}</LayoutRenderer>
    </SortableContext>
  </motion.section>;
}

function CardOverlay({ card, appearance }: { card: Card; appearance: Required<Appearance> }) {
  return <div data-testid="card-drag-overlay" style={cardStyle(appearance)} className="w-64 rotate-2 rounded-[20px] border border-violet-300/40 bg-[#171a28]/95 p-4 shadow-2xl backdrop-blur-xl"><CardRenderer card={card} editing /></div>;
}

function TabCanvas({ tab, editing, dragging, children }: { tab: Tab; editing: boolean; dragging: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `canvas:${tab.id}`, data: { kind: "canvas", tabId: tab.id } satisfies DragData, disabled: !editing });
  return <div ref={setNodeRef} data-testid={`canvas-${tab.id}`} className={cn("min-h-40 rounded-3xl", dragging && "outline outline-dashed outline-white/10", isOver && dragging && "outline-emerald-400/60 bg-emerald-400/[.03]")}>
    {children}
    {editing && dragging && <p className="p-4 text-center text-xs text-emerald-200/80">Drop into a section, or here to move to this tab</p>}
  </div>;
}

export function Dashboard({ config, editing }: { config: ChromaConfig; editing: boolean }) {
  const activeTabId = useEditorStore((state) => state.activeTabId);
  const setActiveTab = useEditorStore((state) => state.setActiveTab);
  const move = useEditorStore((state) => state.moveCard);
  const reorderTabs = useEditorStore((state) => state.reorderTabs);
  const reorderSections = useEditorStore((state) => state.reorderSections);
  const moveWholeSection = useEditorStore((state) => state.moveSection);
  const draft = useEditorStore((state) => state.draft);
  const [draggedCard, setDraggedCard] = useState<{ card: Card; appearance: Required<Appearance> } | null>(null);
  const [draggedSection, setDraggedSection] = useState<Section | null>(null);
  const [dragging, setDragging] = useState(false);
  // A tab switch unmounts the source sortable and clears active.data.current.
  // Keep the source identity for the entire gesture, independently of the canvas.
  const source = useRef<DragData | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const hoverTab = useRef<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const tab = config.tabs.find((item) => item.id === activeTabId) ?? config.tabs[0];

  const clearHover = () => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null; hoverTab.current = null;
  };
  useEffect(() => () => { if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current); }, []);
  const resetDrag = () => { clearHover(); source.current = null; setDragging(false); setDraggedCard(null); setDraggedSection(null); };
  const collisionDetection: CollisionDetection = (args) => {
    const kind = source.current?.kind ?? args.active.data.current?.kind;
    const containers = args.droppableContainers.filter((container) => {
      const data = container.data.current as DragData | undefined;
      if (!data || container.id === args.active.id) return false;
      if (kind === "tab") return data.kind === "tab";
      return kind === "section" ? data.kind !== "card" : true;
    });
    const candidates = { ...args, droppableContainers: containers };
    if (!args.pointerCoordinates) return closestCenter(candidates);
    const hits = pointerWithin(candidates);
    // Nested drop zones: tabs first, then the most specific canvas target.
    for (const kind of ["tab", "card", "section", "canvas"]) {
      const matching = containers.filter((container) => container.data.current?.kind === kind && hits.some((hit) => hit.id === container.id));
      if (matching.length) return closestCenter({ ...args, droppableContainers: matching });
    }
    return [];
  };
  const start = ({ active }: DragStartEvent) => {
    const data = active.data.current as DragData | undefined;
    source.current = data ? { ...data } : null;
    setDragging(true);
    if (data?.kind === "section") setDraggedSection(draft?.tabs.find((tab) => tab.id === data.tabId)?.sections.find((section) => section.id === data.sectionId) ?? null);
    if (data?.kind === "card" && draft) {
      const location = findCard(draft, data.cardId);
      if (location) {
        const sourceTab = draft.tabs[location.tabIndex];
        const sourceSection = sourceTab.sections[location.sectionIndex];
        const card = sourceSection.cards[location.cardIndex];
        setDraggedCard({ card, appearance: resolveAppearance(card, sourceSection, sourceTab, draft.homepage) });
      }
    }
  };
  const over = ({ over }: DragOverEvent) => {
    const activeData = source.current;
    const overData = over?.data.current as DragData | undefined;
    if (!activeData || !["card", "section"].includes(activeData.kind) || overData?.kind !== "tab" || overData.tabId === useEditorStore.getState().activeTabId) {
      clearHover(); return;
    }
    if (hoverTab.current === overData.tabId) return;
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTab.current = overData.tabId;
    hoverTimer.current = window.setTimeout(() => { setActiveTab(overData.tabId); hoverTimer.current = null; }, 500);
  };
  const end = ({ active, over }: DragEndEvent) => {
    const activeData = source.current;
    resetDrag();
    if (!over) return;
    const overData = over.data.current as DragData | undefined;
    if (!activeData || !overData) return;
    if (activeData.kind === "tab" && overData.kind === "tab") reorderTabs(activeData.tabId, overData.tabId);
    if (activeData.kind === "section") {
      if (overData.kind === "section" && activeData.tabId === overData.tabId) reorderSections(activeData.sectionId, overData.sectionId);
      else {
        const index = overData.kind === "section" ? draft?.tabs.find((tab) => tab.id === overData.tabId)?.sections.findIndex((section) => section.id === overData.sectionId) : undefined;
        moveWholeSection(activeData.sectionId, overData.tabId, index);
      }
      setActiveTab(overData.tabId);
    }
    if (activeData.kind === "card" && (overData.kind === "card" || overData.kind === "section")) {
      const targetTabId = overData.tabId;
      const targetSectionId = overData.sectionId;
      let index: number | undefined;
      if (overData.kind === "card" && draft) {
        index = draft.tabs.find((item) => item.id === targetTabId)?.sections.find((item) => item.id === targetSectionId)?.cards.findIndex((item) => item.id === overData.cardId);
        const rect = active.rect.current.translated;
        const origin = findCard(draft, activeData.cardId);
        // Same-section sorting follows document order, not box centers: bento
        // neighbors can have different heights or sit on the same row.
        if (index !== undefined && activeData.sectionId === targetSectionId && origin) {
          if (origin.cardIndex < index) index++;
        } else if (index !== undefined && rect && rect.top + rect.height / 2 > over.rect.top + over.rect.height / 2) index++;
      }
      move(activeData.cardId, targetTabId, targetSectionId, index);
    }
    if (activeData.kind === "card" && (overData.kind === "tab" || overData.kind === "canvas") && draft) {
      const targetTab = draft.tabs.find((tab) => tab.id === overData.tabId);
      if (!targetTab) return;
      if (targetTab.sections.length) move(activeData.cardId, targetTab.id, targetTab.sections[0].id);
      else {
        const next = structuredClone(draft);
        const section = createSection();
        next.tabs.find((tab) => tab.id === targetTab.id)!.sections.push(section);
        useEditorStore.getState().replaceDraft(moveCard(next, activeData.cardId, targetTab.id, section.id));
        useEditorStore.getState().select({ type: "card", tabId: targetTab.id, sectionId: section.id, cardId: activeData.cardId });
      }
      setActiveTab(targetTab.id);
    }
  };

  const tabPosition = config.homepage.tabPosition;
  const canvas = tab && <motion.main key={tab.id} initial={dragging ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: dragging ? 0 : 0.18 }} className="dashboard-canvas dashboard-main"><TabCanvas tab={tab} editing={editing} dragging={dragging}><div className="section-grid"><SortableContext items={tab.sections.map((section) => `section:${section.id}`)} strategy={rectSortingStrategy}>{tab.sections.map((section) => <SortableSection key={section.id} section={section} tab={tab} homepage={config.homepage} editing={editing} />)}</SortableContext></div>{tab.sections.length === 0 && <div className="rounded-3xl border border-dashed border-white/10 py-16 text-center text-slate-500">This tab has no sections yet.</div>}</TabCanvas></motion.main>;
  return <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={start} onDragOver={over} onDragEnd={end} onDragCancel={resetDrag}>
    <div className="dashboard-shell" data-tab-position={tabPosition}>
      <nav className="chroma-tabs dashboard-tabs" data-position={tabPosition} aria-label="Dashboard tabs"><SortableContext items={config.tabs.map((item) => `tab:${item.id}`)}>{config.tabs.map((item) => <SortableTab key={item.id} tab={item} active={item.id === tab?.id} editing={editing} accent={resolveTabAppearance(item, config.homepage).accent} />)}</SortableContext></nav>
      {/* Keep exactly one canvas mounted: exit copies can duplicate sortable IDs after a move. */}
      {canvas}
    </div>
    <DragOverlay dropAnimation={null}>{draggedCard ? <CardOverlay {...draggedCard} /> : draggedSection ? <div data-testid="section-drag-overlay" className="w-64 rounded-2xl border border-violet-300/40 bg-[#171a28]/95 p-5 shadow-2xl"><p className="font-semibold text-white">{draggedSection.title}</p><p className="mt-2 text-sm text-slate-400">{draggedSection.cards.length} cards · Move section</p></div> : null}</DragOverlay>
  </DndContext>;
}
