"use client";

interface StatusMessageProps {
  message: { type: "success" | "error"; text: string } | null;
  inline?: boolean;
}

export default function StatusMessage({ message, inline = false }: StatusMessageProps) {
  if (!message) return null;
  const colorClass = message.type === "success" ? "text-green-600" : "text-red-600";
  if (inline) {
    return <span className={`text-sm ${colorClass}`}>{message.text}</span>;
  }
  return <p className={`text-sm ${colorClass}`}>{message.text}</p>;
}
