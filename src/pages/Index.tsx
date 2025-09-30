import { useEffect, useMemo, useState, useRef } from "react";
import axios from "axios";
import { RSVPSection } from "@/components/RSVPSection";
import { RSVPEvent } from "@/components/RSVPCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Save, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ----------- CONFIG -----------
// removed SINGLE_CHOICE_TYPES - selection type will be read from the event record fields

// ----------- HELPERS -----------
async function fetchAllRecords(
  baseId: string,
  table: string,
  headers: Record<string, string>
) {
  const out: any[] = [];
  let offset: string | undefined = undefined;

  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${table}`);
    if (offset) url.searchParams.set("offset", offset);
    url.searchParams.set("pageSize", "100");
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) throw new Error(`Airtable error ${res.status}`);
    const data = await res.json();
    out.push(...(data.records || []));
    offset = data.offset;
  } while (offset);

  return out;
}

const normText = (v: any) =>
  (typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") : "").trim();

// ----------- PAGE -----------
const Index = () => {
  const [events, setEvents] = useState<RSVPEvent[]>([]);
  const [rsvps, setRsvps] = useState<any[]>([]);
  const [draftResponses, setDraftResponses] = useState<Record<string, "Yes" | "No">>({});
  const [originalResponses, setOriginalResponses] = useState<Record<string, "Yes" | "No">>({});
  const [user, setUser] = useState({
    name: "Guest",
    email: "",
    retreatName: "Retreat",
    retreatLocation: "Location TBA",
  });
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedVisual, setSavedVisual] = useState(false);
  const savedTimerRef = useRef<number | null>(null);

  const { toast } = useToast();

  const apiKey = import.meta.env.VITE_AIRTABLE_API_KEY;
  const baseId = import.meta.env.VITE_AIRTABLE_BASE_ID;
  const eventsTable = import.meta.env.VITE_AIRTABLE_EVENTS_TABLE_NAME;
  const rsvpTable = "Retreat Session RSVPs";
  const participationTable = "Retreat Participation";
  const retreatsTable = "Retreats";

  const retreatParticipationId =
    new URLSearchParams(window.location.search).get("retreatId") || "";

  // Extracted loader so we can re-run a silent refresh after save
  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      if (!retreatParticipationId) {
        console.warn("[Index] Missing retreatParticipationId");
        if (!silent) setLoading(false);
        return;
      }

      const headers = { Authorization: `Bearer ${apiKey}` };
      console.log("[Index] env:", {
        hasKey: !!apiKey,
        baseId,
        eventsTable,
        retreatParticipationId,
      });

      // 1) Participation -> retreatId, user info
      console.log("[Index] Fetch participation…");
      const partRes = await axios.get(
        `https://api.airtable.com/v0/${baseId}/${participationTable}`,
        { headers, params: { filterByFormula: `RECORD_ID()="${retreatParticipationId}"` } }
      );
      const participation = partRes.data.records?.[0];
      console.log("[Index] Participation records:", partRes.data.records?.length);
      if (!participation) {
        console.warn("[Index] No participation row found");
        if (!silent) setLoading(false);
        return;
      }

      const pFields = participation.fields || {};
      const retreatId: string | undefined = pFields["Retreat"]?.[0];
      const userName = pFields["Full Name"] || "Guest";
      const userEmail = pFields["Email"] || "";
      console.log("[Index] retreatId:", retreatId);

      // 2) Retreat details
      let retreatName = "Retreat";
      let retreatLocation = "Location TBA";
      if (retreatId) {
        const ret = await axios.get(
          `https://api.airtable.com/v0/${baseId}/${retreatsTable}`,
          { headers, params: { filterByFormula: `RECORD_ID()="${retreatId}"` } }
        );
        const rf = ret.data.records?.[0]?.fields || {};
        retreatName = rf["Name"] || retreatName;
        retreatLocation = rf["Location"] || retreatLocation;
      }

      // 3) Events (ALL, then filter client-side by retreatId)
      console.log("[Index] Fetching ALL events (paginated) …");
      const allEvents = await fetchAllRecords(baseId, eventsTable, headers);
      console.log("[Index] allEvents:", allEvents.length);

      const filteredEvents = retreatId
        ? allEvents.filter(
            (rec: any) =>
              Array.isArray(rec.fields?.["Retreat"]) &&
              rec.fields["Retreat"].includes(retreatId)
          )
        : [];
      console.log("[Index] filteredEvents (this retreat):", filteredEvents.length);

      // 4) RSVPs (ALL, then filter by Retreat Participation link)
      console.log("[Index] Fetching ALL RSVPs (paginated) …");
      const allRsvps = await fetchAllRecords(baseId, rsvpTable, headers);
      console.log("[Index] ALL RSVPs count:", allRsvps.length);

      if (allRsvps.length) {
        console.log(
          "[Index] RSVP field keys sample:",
          Object.keys(allRsvps[0].fields || {})
        );
      }

      const rsvpRecords = allRsvps.filter((r: any) => {
        // handle accidental trailing-space field names defensively
        const linkA = r.fields?.["Retreat Participation"];
        const linkB = r.fields?.["Retreat Participation "];
        const links = linkA ?? linkB ?? [];
        return Array.isArray(links) && links.includes(retreatParticipationId);
      });

      console.log("[Index] RSVPs for this participant:", rsvpRecords.length);
      console.table(
        rsvpRecords.map((r: any) => ({
          RSVP_ID: r.id,
          Event_ID: r.fields?.Event?.[0],
          Response: r.fields?.["RSVP Response"],
        }))
      );
      // update canonical rsvps
      setRsvps(rsvpRecords);

      // 5) Shape + merge RSVP status
      const shaped: RSVPEvent[] = filteredEvents.map((rec: any) => {
        const f = rec.fields || {};
        const eventId = rec.id;

        // read number of speakers (support common field name variations)
        const numSpeakers =
          Number(f["NumSpeakers"] ?? f["Num Speakers"] ?? f["Num Speakers "] ?? 0) || 0;

        const matched = rsvpRecords.find(
          (r: any) =>
            r.fields?.Event?.[0] === eventId &&
            // also ensure it’s this participant (already filtered, but belt+suspenders)
            ((r.fields?.["Retreat Participation"] || [])[0] === retreatParticipationId ||
              (r.fields?.["Retreat Participation "] || [])[0] === retreatParticipationId)
        );

        if (matched) {
          console.log(
            `[Index] Matched event ${eventId} with RSVP ${matched.id} →`,
            matched.fields?.["RSVP Response"]
          );
        }

        const status: "Yes" | "No" =
          matched?.fields?.["RSVP Response"] === "Yes" ? "Yes" : "No";

        const type = normText(f["Event Type"]) || "General Events";

        // Determine selectionType from the event record (prefer explicit Selection Type field).
        // Support common variations of the field name and basic normalization.
        const rawSelection =
          f["Selection Type"] ??
          f["Selection Type "] ??
          f["Selection"] ??
          f["Selection "] ??
          f["SelectionType"] ??
          f["SelectionType "];
        const selText =
          typeof rawSelection === "string"
            ? rawSelection
            : Array.isArray(rawSelection)
            ? rawSelection.join(", ")
            : "";
        const normalizedSel = selText.trim().toLowerCase();
        const selectionType: "Yes/No" | "One Option" =
          /one|single/.test(normalizedSel) ? "One Option" : "Yes/No";

        // New: read AM/PM, Location and Speaker Full Name fields (defensive)
        const ampm = normText(f["AM/PM"] ?? f["AM/PM "]) || "";
        const location = normText(f["Location"] ?? f["Event Location"] ?? "");
        const speaker = normText(f["Speaker Full Name"] ?? f["Speaker"] ?? "");

        return {
          id: eventId,
          name: f["Event Name"] || "Unnamed Event",
          description: f["Event Notes"] || "",
          date: f["Date"] || "",
          time:
            f["Start Time"] && f["End Time"]
              ? `${f["Start Time"]}–${f["End Time"]}`
              : f["Start Time"] || "",
          type,
          capacity: f["Number of Slots Available"] ?? f["Capacity"] ?? undefined,
          registered: f["Count"] ?? 0,
          // Respect both "Lock RSVP" and "Is Locked" Airtable fields (defensive on trailing-space variants)
          locked: !!(
            f["Lock RSVP"] ||
            f["Lock RSVP "] ||
            f["Is Locked"] ||
            f["Is Locked "]
          ),
          numSpeakers,
          userResponse: status,
          selectionType,
          ampm,
          location,
          speaker,
          group: type,
        };
      });

      // 6) Sort
      shaped.sort((a, b) => {
        const dA = new Date(a.date || 0).getTime();
        const dB = new Date(b.date || 0).getTime();
        if (dA !== dB) return dA - dB;
        const tA = (a.time || "").split("–")[0] || "";
        const tB = (b.time || "").split("–")[0] || "";
        return tA.localeCompare(tB);
      });

      // Move any "Open Seating" events to the very end (case-insensitive match)
      const isOpenSeating = (ev: RSVPEvent) =>
        (ev.name || "").trim().toLowerCase() === "open seating";
      const openSeating = shaped.filter(isOpenSeating);
      const others = shaped.filter((ev) => !isOpenSeating(ev));
      const finalOrder = [...others, ...openSeating];

      // 7) Initialize draft from existing
      const initial: Record<string, "Yes" | "No"> = {};
      finalOrder.forEach((e) => (initial[e.id] = e.userResponse || "No"));
      console.log("[Index] initial draftResponses:", initial);

      setEvents(finalOrder);
      setDraftResponses(initial);
      setOriginalResponses(initial);
      setUser({
        name: userName,
        email: userEmail,
        retreatName,
        retreatLocation,
      });
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    // initial (non-silent) load
    loadData(false);
  }, [retreatParticipationId]);

  // Toggle Yes/No
  const handleToggle = (eventId: string, response: "Yes" | "No") => {
    setDraftResponses((prev) => ({ ...prev, [eventId]: response }));
  };

  // Single-choice toggle
  const handleSingleSelect = (group: string, eventId: string) => {
    setDraftResponses((prev) => {
      const next = { ...prev };
      const groupEvents = events.filter((e) => e.group === group);
      const currentlyYes = groupEvents.find((e) => prev[e.id] === "Yes")?.id || null;
      groupEvents.forEach((e) => (next[e.id] = "No"));
      if (currentlyYes !== eventId) next[eventId] = "Yes";
      return next;
    });
  };

  // Save (upsert 1 row per event)
  const handleSubmit = async () => {
    if (isSaving) return; // prevent double-clicks / re-entrancy
    setIsSaving(true);

    // immediate visual feedback: turn the button green and show "Saved"
    setSavedVisual(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = window.setTimeout(() => setSavedVisual(false), 2500);

    // immediate optimistic success so user doesn't click again
    toast({ title: "Saved", description: "Your RSVP preferences were updated." });
    // mark current draft as original so UI updates instantly
    setOriginalResponses({ ...draftResponses });

    // optimistic local rsvps: mark any previously-missing RSVP as "pending" so subsequent saves see them
    setRsvps((prev) => {
      const existingByEvent = new Map<string, any>();
      prev.forEach((r) => {
        const eventId = r.fields?.Event?.[0];
        if (eventId) existingByEvent.set(eventId, r);
      });
      const next = [...prev];
      for (const e of events) {
        const resp = draftResponses[e.id] ?? "No";
        if (!existingByEvent.has(e.id)) {
          // insert a pending record to avoid duplicate creates in concurrent saves
          next.push({
            id: `pending-${e.id}`,
            fields: {
              Event: [e.id],
              "Retreat Participation": [retreatParticipationId],
              "RSVP Response": resp,
            },
          });
          existingByEvent.set(e.id, true);
        }
      }
      return next;
    });

    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
    try {
      for (const e of events) {
        const response = draftResponses[e.id] ?? "No";
        const existing = rsvps.find(
          (r) =>
            r.fields?.Event?.[0] === e.id &&
            (((r.fields?.["Retreat Participation"] || [])[0] === retreatParticipationId) ||
              ((r.fields?.["Retreat Participation "] || [])[0] === retreatParticipationId))
        );

        if (existing) {
          await axios.patch(
            `https://api.airtable.com/v0/${baseId}/${rsvpTable}/${existing.id}`,
            { fields: { "RSVP Response": response } },
            { headers }
          );
        } else {
          await axios.post(
            `https://api.airtable.com/v0/${baseId}/${rsvpTable}`,
            {
              fields: {
                Event: [e.id],
                "Retreat Participation": [retreatParticipationId],
                "RSVP Response": response,
              },
            },
            { headers }
          );
        }
      }

      // After network operations, refresh data silently to get canonical server state
      // (silent=true avoids toggling the visible loading spinner)
      await loadData(true);
    } catch (err) {
      console.error("[Index] Save error:", err);
      // notify user of failure (we already showed success optimistically)
      toast({ title: "Error", description: "Failed to save. Changes may not have been persisted." });
      // reload to ensure UI reflects server state
      await loadData(true);
    } finally {
      setIsSaving(false);
    }
  };

  // Group by event type
  const groups = useMemo(() => {
    const acc: Record<string, RSVPEvent[]> = {};
    events.forEach((e) => (acc[e.group || "Other"] ||= []).push(e));
    return acc;
  }, [events]);

  // true when every event is locked
  const allSessionsLocked = useMemo(() => events.length > 0 && events.every((e) => !!e.locked), [events]);
  
  // true when any draft value differs from the original loaded value
  const hasUnsavedChanges = useMemo(() => {
    const keys = new Set([...Object.keys(draftResponses), ...Object.keys(originalResponses)]);
    for (const k of keys) {
      const d = draftResponses[k] ?? "No";
      const o = originalResponses[k] ?? "No";
      if (d !== o) return true;
    }
    return false;
  }, [draftResponses, originalResponses]);

  // cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
    }
  }, []);

  if (loading) return <div className="p-6">Loading…</div>;
  if (!retreatParticipationId)
    return <div className="p-6 text-red-600">Missing ?retreatId=recXXXX in the URL.</div>;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-primary text-primary-foreground">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <Calendar className="w-8 h-8" />
              <h1 className="text-3xl font-bold">{user.retreatName}</h1>
            </div>
            <div className="flex items-center gap-2 text-primary-foreground/90">
              <MapPin className="w-5 h-5" />
              <span>{user.retreatLocation}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <Card className="bg-gradient-card border-border/50 shadow-elegant">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-card-foreground">Hi {user.name}! 👋</h2>
                  <p className="text-muted-foreground mt-1">
                    Review and update your RSVP preferences below.
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {user.email || "no-email@unknown"}
                </Badge>
              </div>
            </CardHeader>
          </Card>

          {allSessionsLocked && (
            <Card className="bg-gradient-card border-border/50">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  RSVPs for all sessions are currently locked. Please contact imran34@gmail.com for additional information.
                </p>
              </CardContent>
            </Card>
          )}

          {Object.entries(groups).map(([groupName, list]) => {
            const isSingle = list[0]?.selectionType === "One Option";
            const selectionsForGroup = list.reduce((acc, e) => {
              acc[e.id] = draftResponses[e.id] ?? e.userResponse ?? "No";
              return acc;
            }, {} as Record<string, "Yes" | "No">);

            return (
              <RSVPSection
                key={groupName}
                title={groupName}
                events={list}
                onToggle={handleToggle}
                onSingleSelect={isSingle ? handleSingleSelect : undefined}
                selections={selectionsForGroup}
                disableControls={allSessionsLocked}
              />
            );
          })}

          <Card className="bg-gradient-card border-border/50">
            <CardContent className="pt-6 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {hasUnsavedChanges ? "You have unsaved changes" : "No unsaved changes"}
              </p>
              <Button
                onClick={handleSubmit}
                size="lg"
                disabled={isSaving}
                className={
                  savedVisual
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : "bg-gradient-primary hover:opacity-90"
                }
              >
                {savedVisual ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Saved
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save RSVP Preferences
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Index;
