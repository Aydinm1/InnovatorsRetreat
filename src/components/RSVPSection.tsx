import { RSVPCard, RSVPEvent } from "./RSVPCard";

interface RSVPSectionProps {
  title: string;
  events: RSVPEvent[];
  onToggle: (eventId: string, response: "Yes" | "No") => void;
  onSingleSelect?: (group: string, eventId: string) => void;
  disableControls?: boolean;
  selections: Record<string, "Yes" | "No">;
}

export function RSVPSection({
  title,
  events,
  onToggle,
  onSingleSelect,
  selections,
  disableControls = false,
}: RSVPSectionProps) {
  const isSingle = !!onSingleSelect;
  const selectedInGroup = isSingle
    ? events.find((e) => selections[e.id] === "Yes")?.id || ""
    : "";

  return (
    <div className="space-y-4">
      <div className="border-l-4 border-primary pl-4">
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {isSingle
            ? "Select one option from this category"
            : "Toggle attendance for each event"}
        </p>
      </div>

      <div className="grid gap-4">
        {events.map((event) => (
          <RSVPCard
            key={event.id}
            event={{ ...event, userResponse: selections[event.id] || "No" }}
            onToggle={onToggle}
            onSelect={isSingle ? onSingleSelect : undefined}
            selectedInGroup={isSingle ? selectedInGroup : undefined}
            disableControls={disableControls}
          />
        ))}
      </div>
    </div>
  );
}
