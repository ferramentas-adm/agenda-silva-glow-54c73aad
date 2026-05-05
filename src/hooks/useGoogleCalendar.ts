import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface GoogleCalendarEvent {
  summary: string;
  start: string;
  end: string;
  status: string;
}

interface CalendarEventsResponse {
  connected: boolean;
  expired?: boolean;
  events: GoogleCalendarEvent[];
  error?: string;
}

export function useGoogleCalendarEvents(
  closerId: string | null,
  dateStart: string | null,
  dateEnd: string | null,
) {
  return useQuery<CalendarEventsResponse>({
    queryKey: ["google-calendar-events", closerId, dateStart, dateEnd],
    enabled: !!closerId && !!dateStart && !!dateEnd,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("google-calendar-events", {
        body: { closer_id: closerId, date_start: dateStart, date_end: dateEnd },
      });
      if (error) throw error;
      return data as CalendarEventsResponse;
    },
    refetchInterval: 5 * 60 * 1000, // Poll every 5 minutes
    staleTime: 4 * 60 * 1000,
  });
}

export function useGoogleAuthUrl() {
  const getAuthUrl = async (closerId: string): Promise<string> => {
    const { data, error } = await supabase.functions.invoke("google-auth-url", {
      body: { closer_id: closerId },
    });
    if (error) throw error;
    return data.url;
  };

  return { getAuthUrl };
}

export interface CreateEventParams {
  closer_id: string;
  lead_name: string;
  lead_phone: string;
  sdr_name: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes?: number;
}

export interface CreateEventResult {
  success: boolean;
  meet_link?: string;
  event_id?: string;
  error?: string;
}

export async function createGoogleCalendarEvent(params: CreateEventParams): Promise<CreateEventResult> {
  try {
    const { data, error } = await supabase.functions.invoke("google-create-event", {
      body: params,
    });
    console.log("Google create event response:", { data, error });
    if (error) {
      console.error("Error creating Google event:", error);
      // The SDK may wrap a successful JSON response as an error in some cases
      // Try to parse the error context for a valid response
      if (typeof error === 'object' && (error as any)?.context) {
        try {
          const resp = (error as any).context as Response;
          if (resp && typeof resp.json === 'function') {
            const body = await resp.json();
            console.log("Recovered response from error context:", body);
            if (body?.success) return body as CreateEventResult;
          }
        } catch {
          // ignore parse errors
        }
      }
      return { success: false, error: "invoke_error" };
    }
    return data as CreateEventResult;
  } catch (err) {
    console.error("Unexpected error creating Google event:", err);
    return { success: false, error: "unexpected_error" };
  }
}
