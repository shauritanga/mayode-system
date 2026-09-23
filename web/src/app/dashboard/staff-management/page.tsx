import { redirect } from 'next/navigation';

// Account creation moved into the User Accounts page ("+ New account"
// modal). This route stays as a redirect so old bookmarks keep working.
export default function StaffManagementRedirect() {
  redirect('/dashboard/users');
}
