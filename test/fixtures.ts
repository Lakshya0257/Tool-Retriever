import type { ToolDefinition } from "../src/index.js";

export const tools: ToolDefinition[] = [
  {
    name: "send_email",
    description: "Send an email message to one or more recipients.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "array", items: { type: "string" }, description: "Recipient email addresses" },
        subject: { type: "string", description: "Subject line" },
        body: { type: "string", description: "Plain text body" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "searchContacts",
    description: "Find people in the address book by name or company.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Name or company to look up" } },
    },
  },
  {
    name: "get_weather",
    description: "Current weather and forecast for a city.",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string" },
        units: { type: "string", enum: ["celsius", "fahrenheit"] },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Schedule a meeting on the user's calendar.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          start: { type: "string", description: "ISO start time" },
          attendees: { type: "array", items: { type: "string", description: "Attendee emails" } },
        },
      },
    },
  },
  {
    name: "delete_file",
    description: "Permanently remove a file from storage.",
    input_schema: { type: "object", properties: { path: { type: "string" } } },
    annotations: { destructiveHint: true },
  },
  {
    name: "read_file",
    description: "Read the contents of a file.",
    inputSchema: { type: "object", properties: { path: { type: "string" } } },
    annotations: { readOnlyHint: true },
  },
];
