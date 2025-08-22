// zentrale Stelle für Tabellennamen (Supabase public schema)
export const T = {
  // Posts + Joins (deine "extra" Tabelle)
  posts: 'posts',
  postCategories: 'post_categories', // (post_id, category_id)
  postBadges: 'post_badges',         // (post_id, badge_id)

  // Stammdaten
  vendors: 'vendors',
  categories: 'categories',
  badges: 'badges',

  // Gruppen
  vendorGroups: 'vendor_groups',
  vendorGroupMembers: 'vendor_group_members',

  // USERS

   appUsers: 'app_users',
   
} as const;