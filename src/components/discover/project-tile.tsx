import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { categoryOf, projectLogo, type ProjectCard } from "@/lib/project-queries";
import { MediaImage } from "@/components/clyro/primitives";
import { Mascot } from "@/components/workspace/mascot";

/**
 * A "foto" do projeto. Com capa, a capa; sem, o logo (ou a foto de quem
 * criou) no centro; sem nenhum dos dois, o mascote — assim a vitrine nunca tem
 * buraco cinza.
 */
export function ProjectArt({
  project,
  className,
  mascotSize = 96,
}: {
  project: Pick<ProjectCard, "cover_url" | "category" | "name"> &
    Partial<Pick<ProjectCard, "icon_url" | "owner_avatar">>;
  className?: string;
  mascotSize?: number;
}) {
  const cat = categoryOf(project.category);
  if (project.cover_url) {
    return (
      <MediaImage
        src={project.cover_url}
        alt=""
        className={cn("h-full w-full object-cover", className)}
      />
    );
  }
  const logo = projectLogo(project);
  return (
    <div
      className={cn("flex h-full w-full items-center justify-center", className)}
      style={{ background: "var(--surface-2)" }}
    >
      {logo ? (
        <MediaImage
          src={logo}
          alt=""
          className="rounded-full object-cover shadow-[0_0_0_4px_var(--card)]"
          style={{ width: mascotSize, height: mascotSize }}
        />
      ) : (
        <Mascot pose={cat?.pose ?? "neutro"} size={mascotSize} />
      )}
    </div>
  );
}

/** Ladrilho da grade: a arte ocupa tudo, o nome num rótulo branco no canto. */
export function ProjectTile({ project, className }: { project: ProjectCard; className?: string }) {
  return (
    <Link
      to="/p/$projectId"
      params={{ projectId: project.id }}
      className={cn("group relative block overflow-hidden bg-secondary", className)}
    >
      <ProjectArt
        project={project}
        className="transition-transform duration-500 ease-clyro group-hover:scale-[1.04]"
      />
      <span className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] truncate rounded-md border border-edge bg-white/90 px-2.5 py-1 text-[13px] font-medium backdrop-blur">
        {project.name}
      </span>
    </Link>
  );
}

/** Cartão flutuante do topo: imagem quadrada, nome e o que procura. */
export function FloatingProjectCard({
  project,
  className,
}: {
  project: ProjectCard;
  className?: string;
}) {
  return (
    <Link
      to="/p/$projectId"
      params={{ projectId: project.id }}
      className={cn(
        "block w-40 rounded-[28px] bg-card p-1.5 shadow-card transition-transform duration-300 ease-clyro hover:-translate-y-1 sm:w-44",
        className,
      )}
    >
      <div className="aspect-square overflow-hidden rounded-[22px]">
        <ProjectArt project={project} mascotSize={84} />
      </div>
      <div className="px-2 pb-2 pt-2.5">
        <p className="truncate text-sm font-semibold">{project.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {project.looking_for.length
            ? `Procura ${project.looking_for.slice(0, 2).join(", ")}`
            : `${project.member_count} ${project.member_count === 1 ? "pessoa" : "pessoas"}`}
        </p>
      </div>
    </Link>
  );
}
