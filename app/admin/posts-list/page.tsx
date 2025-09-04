// app/admin/posts-list/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import PostsListClient from './PostsListClient';

export default function Page() {
  return <PostsListClient />;
}