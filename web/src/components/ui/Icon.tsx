// Ikon garis rounded kustom (stroke 1.6–1.8), bukan ikon default.
const P: Record<string, string> = {
  home: "M3.5 3.5h7.5v9H3.5zM13 3.5h7.5v6H13zM13 11.5h7.5v9H13zM3.5 14.5h7.5v6H3.5z",
  trend: "M3.5 17l5.5-5.5 4 4 7.5-7.5M15 8h5.5v5.5",
  search: "M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-3.9-3.9",
  star: "M11.1 3.9a1 1 0 0 1 1.8 0l2 4.1 4.5.7a1 1 0 0 1 .6 1.7l-3.3 3.2.8 4.5a1 1 0 0 1-1.5 1.1L12 17.1l-4 2.1a1 1 0 0 1-1.5-1.1l.8-4.5L4 10.4a1 1 0 0 1 .6-1.7l4.5-.7z",
  user: "M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4.8 20.5c.7-3.8 3.6-6 7.2-6s6.5 2.2 7.2 6",
  bell: "M5.6 15.2V10a6.4 6.4 0 0 1 12.8 0v5.2l1.2 1.7a.9.9 0 0 1-.7 1.4H5.1a.9.9 0 0 1-.7-1.4zM9.8 20.6a2.4 2.4 0 0 0 4.4 0",
  calendar: "M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5zM4 10h16M8.5 3v4M15.5 3v4",
  clock: "M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM12 7.8V12l2.8 1.8",
  eye: "M2.8 12C4.6 8 8 5.5 12 5.5S19.4 8 21.2 12C19.4 16 16 18.5 12 18.5S4.6 16 2.8 12zM12 9.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z",
  right: "M9.5 6l6 6-6 6",
  left: "M14.5 6l-6 6 6 6",
  down: "M6 9.5l6 6 6-6",
  share: "M17 3.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM7 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM17 14.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM9.6 10.6l4.8-2.7M9.6 13.4l4.8 2.7",
  bookmark: "M6.5 4.5h11v15.5L12 16.2 6.5 20z",
  bolt: "M13 3L5 13.5h6L10.5 21 19 10.5h-6z",
  mail: "M3 7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM6.5 9l4.3 3.1a2 2 0 0 0 2.4 0L17.5 9",
  lock: "M4.5 13.5A3.5 3.5 0 0 1 8 10h8a3.5 3.5 0 0 1 3.5 3.5v3.5A3.5 3.5 0 0 1 16 20.5H8A3.5 3.5 0 0 1 4.5 17zM8 10V7.8a4 4 0 0 1 8 0V10",
  chat: "M4 7.5A3.5 3.5 0 0 1 7.5 4h9A3.5 3.5 0 0 1 20 7.5v6a3.5 3.5 0 0 1-3.5 3.5H11l-4.3 3.3c-.5.4-1.2 0-1.2-.6V17A3.5 3.5 0 0 1 4 13.5z",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z",
  tag: "M3.5 12.2V5a1.5 1.5 0 0 1 1.5-1.5h7.2a1.5 1.5 0 0 1 1 .4l7 7a1.5 1.5 0 0 1 0 2.2l-7.2 7.2a1.5 1.5 0 0 1-2.2 0l-7-7a1.5 1.5 0 0 1-.3-1.1zM8 7.2a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6z",
  chart: "M5 19V9M12 19V5M19 19v-7",
};

export function Icon({ name, size = 20, stroke = 1.7, label }: { name: keyof typeof P | string; size?: number; stroke?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d={P[name] ?? P.right} />
    </svg>
  );
}
