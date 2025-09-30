import { useEffect } from "react";
import axios from "axios";

const DebugEvents = () => {
  useEffect(() => {
    const runDebug = async () => {
      try {
        const apiKey = import.meta.env.VITE_AIRTABLE_API_KEY;
        const baseId = import.meta.env.VITE_AIRTABLE_BASE_ID;
        const eventsTable = import.meta.env.VITE_AIRTABLE_EVENTS_TABLE_NAME;

        const headers = { Authorization: `Bearer ${apiKey}` };
        const url = `https://api.airtable.com/v0/${baseId}/${eventsTable}`;

        const res = await axios.get(url, { headers });
        const records = res.data.records || [];

        const rows = records.map((r: any) => ({
          Event_ID: r.id,
          Retreat_IDs: r.fields?.Retreat || [],
          Event_Name: r.fields?.["Event Name"] || "Unnamed",
        }));

        console.log("=== Debug: Event Retreat Links ===");
        console.table(rows);
      } catch (err) {
        console.error("Debug error fetching events:", err);
      }
    };

    runDebug();
  }, []);

  return null; // nothing visible
};

export default DebugEvents;
