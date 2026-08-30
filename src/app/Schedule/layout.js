export const metadata = {
  title: "ตารางเรียน",
  description: "จัดตารางเรียนรายสัปดาห์",
  icons: {
    // the previous data URI had an empty xmlns, so the browser refused to parse
    // it and the tab fell back to the site favicon
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📅</text></svg>",
  },
};

export default function ScheduleLayout({ children }) {
  return children;
}
