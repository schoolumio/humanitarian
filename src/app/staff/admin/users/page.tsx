import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { ROLE_LABELS, PRIVILEGED_ROLES } from "@/lib/permissions";
import {
  Badge,
  DataTable,
  PageHeader,
  Pagination,
  buttonClass,
  formatDate,
  inputClass,
} from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { requirePagePermission } from "@/server/current-user";
import { runAction, currentActor, str, type FormState } from "@/server/action";
import { listUsers, setRole, setUserStatus } from "@/server/services/admin";

export const metadata = { title: "Users and roles" };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const actor = await requirePagePermission("admin.users");
  const sp = await searchParams;
  const res = await listUsers(actor, sp.q, Number(sp.page ?? 1));
  async function role(userId: string, _: FormState, fd: FormData): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await setRole(await currentActor(), userId, str(fd, "role") as Role, str(fd, "op") === "grant");
      revalidatePath("/staff/admin/users");
      return "Roles updated. The user's sessions were signed out so changes apply immediately.";
    });
  }
  async function status(userId: string, s: "ACTIVE" | "SUSPENDED"): Promise<FormState> {
    "use server";
    return runAction(async () => {
      await setUserStatus(await currentActor(), userId, s);
      revalidatePath("/staff/admin/users");
      return "Updated.";
    });
  }
  const grantable = (Object.keys(ROLE_LABELS) as Role[]).filter(
    (r) => !PRIVILEGED_ROLES.includes(r) || actor.permissions.has("admin.privileged_roles"),
  );
  return (
    <div>
      <PageHeader
        title="Users and roles"
        description="Role changes are audited and require two-step verification. Only super administrators can grant administrator, finance or safeguarding roles. Nobody can change their own roles."
      />
      <form className="mb-4 flex gap-2" role="search">
        <input
          name="q"
          defaultValue={sp.q}
          className={inputClass}
          aria-label="Search users"
          placeholder="Name or email"
        />
        <button className={buttonClass("secondary")}>Search</button>
      </form>
      <DataTable
        caption="Users"
        rows={res.rows}
        rowKey={(u) => u.id}
        columns={[
          {
            header: "User",
            cell: (u) => (
              <>
                {u.name}
                <span className="block text-sm text-muted">{u.email}</span>
              </>
            ),
          },
          {
            header: "Roles",
            cell: (u) => (
              <span className="flex flex-wrap gap-1">
                {u.roles.map((r) => (
                  <Badge key={r.role}>{ROLE_LABELS[r.role]}</Badge>
                ))}
              </span>
            ),
          },
          {
            header: "Security",
            cell: (u) => (
              <span className="text-sm">
                {u.mfaEnabledAt ? "2SV on" : "2SV off"} ·{" "}
                {u.emailVerifiedAt ? "email confirmed" : "unconfirmed"}
              </span>
            ),
          },
          {
            header: "Status",
            cell: (u) => (
              <Badge tone={u.status === "ACTIVE" ? "success" : "danger"}>{u.status.toLowerCase()}</Badge>
            ),
          },
          { header: "Last sign-in", cell: (u) => formatDate(u.lastLoginAt) },
          {
            header: "Manage",
            cell: (u) =>
              u.id === actor.userId ? (
                <span className="text-sm text-muted">You</span>
              ) : (
                <div className="flex flex-col gap-1">
                  <ActionForm action={role.bind(null, u.id)}>
                    <select name="role" className={inputClass} aria-label="Role">
                      {grantable.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    <select name="op" className={inputClass} aria-label="Grant or revoke">
                      <option value="grant">Grant</option>
                      <option value="revoke">Revoke</option>
                    </select>
                    <SubmitButton variant="secondary" confirm="Change this user's roles?">
                      Apply
                    </SubmitButton>
                  </ActionForm>
                  {u.status === "ACTIVE" ? (
                    <ActionForm action={status.bind(null, u.id, "SUSPENDED")}>
                      <SubmitButton variant="ghost" confirm="Suspend this account?">
                        Suspend
                      </SubmitButton>
                    </ActionForm>
                  ) : u.status === "SUSPENDED" ? (
                    <ActionForm action={status.bind(null, u.id, "ACTIVE")}>
                      <SubmitButton variant="ghost">Reactivate</SubmitButton>
                    </ActionForm>
                  ) : null}
                </div>
              ),
          },
        ]}
      />
      <Pagination
        page={res.page}
        pageSize={res.pageSize}
        total={res.total}
        hrefFor={(p) => `/staff/admin/users?page=${p}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`}
      />
    </div>
  );
}
