import { useState } from "react";
import { Gallery } from "iconsax-react";
import { cn } from "@/lib/utils";
import { useProfiles } from "@/lib/clyro-queries";
import { categoryOf, useProfileProjects, type ProfileProject } from "@/lib/project-queries";
import { ProjectArt } from "@/components/discover/project-tile";
import { Mascot } from "@/components/workspace/mascot";
import { useAuth } from "@/hooks/useAuth";
import { MediaImage } from "./primitives";
import { ProfilePanel } from "./profile-panel";

type Filter = "all" | "founded" | "joined";

/**
 * O perfil como página: o cartão cinza à esquerda e, à direita, a capa, as
 * abas em pílula e a grade com os projetos da pessoa.
 */
export function ProfilePage({
  profileId,
  onClose,
  onOpenDM,
  onCall,
  onEditProfile,
  onOpenMessages,
  onOpenProject,
}: {
  profileId: string;
  onClose: () => void;
  onOpenDM: (userId: string) => void;
  onCall: (userId: string, video: boolean) => void;
  onEditProfile: () => void;
  onOpenMessages: () => void;
  onOpenProject: (project: ProfileProject) => void;
}) {
  const { user } = useAuth();
  const { data: profiles } = useProfiles();
  const profile = profiles?.get(profileId);
  const isSelf = profileId === user?.id;
  const { data: projects = [], isLoading } = useProfileProjects(profileId);
  const [filter, setFilter] = useState<Filter>("all");

  const founded = projects.filter((p) => p.founded);
  const joined = projects.filter((p) => !p.founded);
  const shown = filter === "founded" ? founded : filter === "joined" ? joined : projects;
  const firstName = (profile?.display_name || profile?.username || "").split(" ")[0];

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "Projetos", count: projects.length },
    ...(founded.length ? [{ id: "founded" as const, label: "Fundou", count: founded.length }] : []),
    ...(joined.length ? [{ id: "joined" as const, label: "Participa", count: joined.length }] : []),
  ];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 clyro-scroll sm:p-6">
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] xl:gap-7">
        <div className="lg:sticky lg:top-0">
          <ProfilePanel
            variant="page"
            profileId={profileId}
            onClose={onClose}
            onOpenDM={onOpenDM}
            onCall={onCall}
            onEditProfile={onEditProfile}
            onOpenMessages={onOpenMessages}
          />
        </div>

        <div className="clyro-fade-in flex min-w-0 flex-col gap-5">
          <Cover
            bannerUrl={profile?.banner_url ?? null}
            bannerColor={profile?.banner_color ?? null}
            projects={projects}
            isSelf={isSelf}
            onEdit={onEditProfile}
          />

          <div role="tablist" className="flex flex-wrap gap-3">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={filter === t.id}
                onClick={() => setFilter(t.id)}
                className={cn(
                  "inline-flex h-12 items-center gap-2 rounded-full px-7 text-[15px] font-medium transition-[background-color,box-shadow,transform] duration-200 ease-clyro active:scale-[0.98]",
                  filter === t.id
                    ? "bg-brand text-white shadow-[0_12px_24px_-12px_var(--brand)]"
                    : "bg-card shadow-soft hover:bg-secondary",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "text-[13px] tabular-nums",
                    filter === t.id ? "text-white/75" : "text-muted-foreground",
                  )}
                >
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          <section className="ws-frame p-3 sm:p-4">
            {isLoading ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-[248px] animate-pulse rounded-[22px] bg-card/70" />
                ))}
              </div>
            ) : shown.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <Mascot pose="brincando" size={88} float />
                <p className="mt-4 text-[16px] font-semibold">
                  {isSelf
                    ? "Seus projetos aparecem aqui"
                    : `${firstName} ainda não tem projetos à vista`}
                </p>
                <p className="mt-1 max-w-[42ch] text-[14px] leading-[1.5] text-muted-foreground">
                  {isSelf
                    ? "Os workspaces que você fundar ou em que entrar ficam reunidos neste perfil."
                    : "Quando entrarem no mesmo workspace ou publicarem um projeto, ele aparece aqui."}
                </p>
              </div>
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
                {shown.map((p) => (
                  <li key={p.id}>
                    <ProjectCard project={p} onOpen={() => onOpenProject(p)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Cover({
  bannerUrl,
  bannerColor,
  projects,
  isSelf,
  onEdit,
}: {
  bannerUrl: string | null;
  bannerColor: string | null;
  projects: ProfileProject[];
  isSelf: boolean;
  onEdit: () => void;
}) {
  const collage = projects.slice(0, 3);
  return (
    <div className="ws-frame p-2">
      <div
        className="relative h-[clamp(200px,30vh,300px)] overflow-hidden rounded-[26px]"
        style={{ background: bannerUrl ? undefined : (bannerColor ?? "var(--brand-soft)") }}
      >
        {bannerUrl ? (
          <MediaImage src={bannerUrl} alt="" className="h-full w-full object-cover" />
        ) : collage.length > 0 ? (
          // Sem capa: os próprios projetos, soltos como cartões sobre a mesa.
          <div className="absolute inset-0 flex items-center justify-center">
            {collage.map((p, i) => (
              <div
                key={p.id}
                className={cn(
                  "absolute w-[clamp(104px,15%,150px)] rounded-[22px] bg-card p-1.5 shadow-[0_24px_40px_-24px_rgb(0_0_0/0.35)]",
                  COLLAGE[collage.length - 1]?.[i],
                )}
              >
                <div className="aspect-square overflow-hidden rounded-[17px]">
                  <ProjectArt project={p} mascotSize={64} />
                </div>
                <p className="truncate px-1.5 pb-1 pt-2 text-[12px] font-semibold">{p.name}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Mascot pose="brincando" size={140} float />
          </div>
        )}

        {isSelf && !bannerUrl && (
          <button
            type="button"
            onClick={onEdit}
            className="absolute bottom-3 right-3 inline-flex h-9 items-center gap-2 rounded-full bg-card/90 px-4 text-[13px] font-medium shadow-soft backdrop-blur transition-colors hover:bg-card"
          >
            <Gallery size={16} color="currentColor" />
            Adicionar capa
          </button>
        )}
      </div>
    </div>
  );
}

/** Posições da colagem por quantidade de cartões: um, dois ou três. */
const COLLAGE: string[][] = [
  ["rotate-[-4deg]"],
  ["-translate-x-[38%] rotate-[-7deg]", "translate-x-[38%] translate-y-[6%] rotate-[6deg]"],
  [
    "-translate-x-[78%] translate-y-[8%] rotate-[-9deg]",
    "z-10 -translate-y-[4%] rotate-[-1deg]",
    "translate-x-[78%] translate-y-[10%] rotate-[8deg]",
  ],
];

function ProjectCard({ project, onOpen }: { project: ProfileProject; onOpen: () => void }) {
  const cat = categoryOf(project.category);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group block w-full rounded-[22px] bg-card p-2 text-left transition-[box-shadow,transform] duration-300 ease-clyro hover:-translate-y-0.5 hover:shadow-soft"
    >
      <div className="aspect-[4/3] overflow-hidden rounded-[16px]">
        <ProjectArt
          project={project}
          mascotSize={72}
          className="transition-transform duration-500 ease-clyro group-hover:scale-[1.04]"
        />
      </div>
      <div className="px-2 pb-2 pt-3">
        <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">{project.name}</p>
        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
          {project.tagline || cat?.label || "Projeto no Clyro"}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[12px] font-medium",
              project.founded ? "bg-foreground text-background" : "bg-secondary",
            )}
          >
            {project.founded ? "Fundou" : "Participa"}
          </span>
          {project.stage && (
            <span className="rounded-full bg-secondary px-2.5 py-1 text-[12px] font-medium">
              {project.stage}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
