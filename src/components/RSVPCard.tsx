import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Clock, Users, Lock } from "lucide-react";

export interface RSVPEvent {
  id: string;
  name: string;
  description: string;
  date: string;
  time: string;
  type: string;
  capacity?: number;
  registered: number;
  userResponse?: "Yes" | "No" | null;
  locked?: boolean;
  selectionType?: "Yes/No" | "One Option";
  group?: string; // Event Type label
  ampm?: string;
  location?: string;
  numSpeakers?: number;
  speaker?: string;
}

interface RSVPCardProps {
  event: RSVPEvent;
  onToggle?: (eventId: string, response: "Yes" | "No") => void;
  onSelect?: (group: string, eventId: string) => void; // for single-choice
  selectedInGroup?: string; // id of selected event in group
  disableControls?: boolean;
}

export function RSVPCard({ event, onToggle, onSelect, selectedInGroup, disableControls }: RSVPCardProps) {
  const spotsLeft = event.capacity ? event.capacity - (event.registered || 0) : null;
  const isFull = spotsLeft !== null && spotsLeft <= 0;
  const isSingle = event.selectionType === "One Option";
  const isSelected = isSingle ? selectedInGroup === event.id : event.userResponse === "Yes";

  // Friendly date formatting (defensive - fallback to raw value)
  const friendlyDate = (() => {
    try {
      const d = new Date(event.date);
      if (isNaN(d.getTime())) return event.date;
      // Use Lisbon timezone so weekday matches Lisbon-local dates
      return d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "Europe/Lisbon",
      });
    } catch {
      return event.date;
    }
  })();

  const handleToggle = (checked: boolean) => {
    if (event.locked || (isFull && checked)) return;
    onToggle?.(event.id, checked ? "Yes" : "No");
  };

  const handleRadio = () => {
    if (event.locked || (isFull && !isSelected)) return;
    onSelect?.(event.group || event.type, event.id);
  };

  const cardClickable = isSingle && !event.locked && !isFull && !disableControls;
  const cardDisabled = isSingle && (event.locked || isFull) && !disableControls; // show not-allowed cursor when single-choice and disabled

  const onCardKeyDown = (e: React.KeyboardEvent) => {
    if (!cardClickable) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleRadio();
    }
  };

  return (
    <Card
      role={cardClickable ? "button" : undefined}
      tabIndex={cardClickable ? 0 : undefined}
      onClick={cardClickable ? handleRadio : undefined}
      onKeyDown={onCardKeyDown}
      aria-disabled={cardDisabled ? true : undefined}
      // ensure the not-allowed cursor shows across the entire card when appropriate
      style={cardDisabled ? { cursor: "not-allowed" } : undefined}
      className={`group hover:shadow-card transition-all duration-300 bg-gradient-card border-border/50 ${
        cardClickable
          ? "cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          : cardDisabled
          ? "cursor-not-allowed"
          : ""
      }`}
      aria-pressed={cardClickable ? isSelected : undefined}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg font-semibold text-card-foreground mb-1">
              {event.name}
            </CardTitle>
            {event.speaker && (
              <p className="text-sm text-muted-foreground mb-1">
                {event.numSpeakers && event.numSpeakers > 1 ? "Speakers:" : "Speaker:"} {event.speaker}
              </p>
            )}
            {event.description && (
              <p className="text-sm text-muted-foreground mb-2">{event.description}</p>
            )}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>
                  {friendlyDate}
                  {event.time ? ` at ${event.time}` : ""}
                  {event.ampm ? ` ${event.ampm}` : ""}
                </span>
              </div>
              {typeof event.capacity === "number" && (
                <div className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  <span>{event.registered}/{event.capacity}</span>
                </div>
              )}
            </div>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {event.type}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {event.locked && !disableControls ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="w-4 h-4" />
                <span>
                  RSVP's for this session are now locked, please contact imran34@gmail.com for additional information.
                </span>
              </div>
            ) : (
              <>
                {spotsLeft !== null && (
                  <Badge
                    variant={isFull ? "destructive" : spotsLeft <= 2 ? "destructive" : spotsLeft <= 5 ? "warning" : "success"}
                    className="text-xs"
                  >
                    {isFull ? "Full" : `${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left`}
                  </Badge>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* hide individual radio/select/switch when disableControls (global lock) is active */}
            {!disableControls ? (
              isSingle ? (
                <RadioGroup value={isSelected ? event.id : ""} className="flex items-center">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem
                      value={event.id}
                      id={`radio-${event.id}`}
                      onClick={(e) => {
                        e.stopPropagation(); // keep radio click semantics isolated
                        handleRadio();
                      }}
                      disabled={event.locked || (isFull && !isSelected)}
                    />
                    <Label htmlFor={`radio-${event.id}`} className="text-sm font-medium">
                      {isSelected ? "Selected" : "Select"}
                    </Label>
                  </div>
                </RadioGroup>
              ) : (
                <div className="flex items-center gap-2">
                  <Label htmlFor={`switch-${event.id}`} className="text-sm font-medium">
                    {isSelected ? "Attending" : "Not attending"}
                  </Label>
                  <Switch
                    id={`switch-${event.id}`}
                    checked={isSelected}
                    onCheckedChange={handleToggle}
                    disabled={event.locked || (isFull && !isSelected)}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>
              )
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
