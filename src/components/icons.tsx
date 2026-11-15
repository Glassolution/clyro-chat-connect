import type { CSSProperties, FC } from "react";
import * as Isax from "iconsax-react";
import { cn } from "@/lib/utils";

/**
 * Iconografia do Clyro: Iconsax no traço "Linear" — fino, arredondado, a cor do
 * texto. Os nomes seguem os do lucide que o app já usava, então trocar a fonte
 * dos ícones é trocar só o import.
 */
export type IconProps = {
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
  "aria-hidden"?: boolean;
};

export type IconComponent = FC<IconProps>;

function wrap(Source: Isax.Icon, extraClass?: string): IconComponent {
  const Wrapped: IconComponent = ({ size = 24, className, style }) => (
    <Source
      size={size}
      color="currentColor"
      variant="Linear"
      aria-hidden="true"
      className={cn("clyro-icon shrink-0", extraClass, className)}
      style={style}
    />
  );
  return Wrapped;
}

/** Os poucos que o Iconsax não tem, desenhados no mesmo traço. */
function stroke(paths: string[]): IconComponent {
  const Drawn: IconComponent = ({ size = 24, className, style }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("clyro-icon shrink-0", className)}
      style={style}
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
  return Drawn;
}

export const X = stroke(["M6 6l12 12", "M18 6L6 18"]);
export const Check = stroke(["M5 12.5l4.5 4.5L19 7.5"]);
export const AtSign = stroke([
  "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  "M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1",
]);
export const Minimize2 = stroke(["M4 14h6v6", "M20 10h-6V4", "M14 10l7-7", "M3 21l7-7"]);
export const Strikethrough = stroke([
  "M4 12h16",
  "M16.5 7.5c-.6-1.8-2.4-3-4.5-3-2.5 0-4.5 1.6-4.5 3.6 0 1.2.6 2.2 1.8 2.9",
  "M8 16.5c.6 1.8 2.4 3 4.5 3 2.5 0 4.5-1.6 4.5-3.6 0-.6-.1-1.1-.4-1.6",
]);

export const ArrowLeft = wrap(Isax.ArrowLeft);
export const ArrowRight = wrap(Isax.ArrowRight);
export const ArrowUpRight = wrap(Isax.ExportSquare);
export const Bell = wrap(Isax.Notification);
export const Bold = wrap(Isax.TextBold);
export const CalendarCheck = wrap(Isax.CalendarTick);
export const Camera = wrap(Isax.Camera);
export const ChevronDown = wrap(Isax.ArrowDown2);
export const ChevronRight = wrap(Isax.ArrowRight2);
export const ChevronUp = wrap(Isax.ArrowUp2);
export const Code = wrap(Isax.Code);
export const Compass = wrap(Isax.Global);
export const Copy = wrap(Isax.Copy);
export const Crown = wrap(Isax.Crown1);
export const FolderPlus = wrap(Isax.FolderAdd);
export const Hand = wrap(Isax.Like1);
export const Hash = wrap(Isax.Hashtag);
export const Headphones = wrap(Isax.Headphone);
export const HeadphoneOff = wrap(Isax.VolumeSlash);
export const Heart = wrap(Isax.Heart);
export const ImagePlus = wrap(Isax.GalleryAdd);
export const Italic = wrap(Isax.TextItalic);
export const KeyRound = wrap(Isax.Key);
export const LayoutGrid = wrap(Isax.Element3);
export const ListChecks = wrap(Isax.TaskSquare);
export const LogOut = wrap(Isax.Logout);
export const Mail = wrap(Isax.Sms);
export const Maximize2 = wrap(Isax.Maximize4);
export const Megaphone = wrap(Isax.Notification);
export const Menu = wrap(Isax.HambergerMenu);
export const MessageCircle = wrap(Isax.Message);
export const MessageSquare = wrap(Isax.MessageText);
export const MessagesSquare = wrap(Isax.Messages2);
export const Mic = wrap(Isax.Microphone2);
export const MicOff = wrap(Isax.MicrophoneSlash1);
export const MonitorUp = wrap(Isax.Monitor);
export const MonitorX = wrap(Isax.CloseSquare);
export const MoreHorizontal = wrap(Isax.More);
export const Phone = wrap(Isax.Call);
export const PhoneOff = wrap(Isax.CallSlash);
export const Play = wrap(Isax.Play);
export const Plus = wrap(Isax.Add);
export const Search = wrap(Isax.SearchNormal1);
export const Send = wrap(Isax.Send2);
export const SendHorizonal = wrap(Isax.Send2);
export const Settings = wrap(Isax.Setting2);
export const ShieldCheck = wrap(Isax.ShieldTick);
export const Signal = wrap(Isax.Wifi);
export const Smile = wrap(Isax.EmojiHappy);
export const Sparkles = wrap(Isax.MagicStar);
export const Timer = wrap(Isax.Timer1);
export const Upload = wrap(Isax.DocumentUpload);
export const UserMinus = wrap(Isax.UserMinus);
export const UserPlus = wrap(Isax.UserAdd);
export const Users = wrap(Isax.People);
export const UsersRound = wrap(Isax.Profile2User);
export const Video = wrap(Isax.Video);
export const VideoOff = wrap(Isax.VideoSlash);
export const Volume2 = wrap(Isax.VolumeHigh);
export const Workflow = wrap(Isax.Hierarchy);
