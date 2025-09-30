// lib/fetchEvents.ts
import axios from "axios";

const AIRTABLE_API_KEY = import.meta.env.VITE_AIRTABLE_API_KEY;
const BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID;
const TABLE_NAME = import.meta.env.VITE_AIRTABLE_EVENTS_TABLE_NAME;


export interface AirtableRSVPEvent {
  id: string;
  fields: {
    Name: string;
    Description?: string;
    Date: string;
    Time?: string;
    Type: string;
    Capacity?: number;
    Registered?: number;f
    Group?: string;
  };
}

export const fetchRSVPEvents = async (): Promise<AirtableRSVPEvent[]> => {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_NAME}`;

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      },
    });

    return response.data.records;
  } catch (error) {
    console.error("Failed to fetch Airtable events:", error);
    return [];
  }
};
