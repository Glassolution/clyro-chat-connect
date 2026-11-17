import { Hashtag, Home2, Message, Profile2User, TaskSquare, type Icon } from "iconsax-react";

export type Section = "dashboard" | "rooms" | "messages" | "team" | "tasks";

export const SECTIONS: { id: Section; label: string; icon: Icon }[] = [
  { id: "dashboard", label: "Painel", icon: Home2 },
  { id: "rooms", label: "Salas", icon: Hashtag },
  { id: "tasks", label: "Tasks", icon: TaskSquare },
  { id: "messages", label: "Mensagens", icon: Message },
  { id: "team", label: "Equipe", icon: Profile2User },
];
