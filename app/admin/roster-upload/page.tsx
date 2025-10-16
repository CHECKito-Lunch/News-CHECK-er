import RosterUploadClient from "./RosterUploadClient";


// app/admin/polls/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;


export default function Page() {
  return <RosterUploadClient/>;
}
