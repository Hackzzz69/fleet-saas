/* Auth helpers: sign up / in / out, session guard, profile + orgs. */

async function currentUser() {
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

async function requireUser(redirectTo = "login.html") {
  const user = await currentUser();
  if (!user) window.location.href = redirectTo;
  return user;
}

async function signUp(email, password, fullName, orgName) {
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { full_name: fullName, org_name: orgName } },
  });
  return { data, error };
}

async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  return { data, error };
}

async function signOut() {
  await sb.auth.signOut();
  window.location.href = "index.html";
}

/* Orgs the user belongs to, with their role. */
async function myOrgs() {
  const { data, error } = await supabase
    .from("org_members")
    .select("role, orgs(id, name, plan)")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map(m => ({ ...m.orgs, role: m.role }));
}

function activeOrgId() {
  return localStorage.getItem("fleetdesk_org");
}
function setActiveOrgId(id) {
  localStorage.setItem("fleetdesk_org", id);
}
