import type { SVGProps } from "react";
import Image from "next/image";

export function UncleEggheadLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <Image
      src="https://framerusercontent.com/images/I5FEc2KoLlqbEFHEDFhuv5movwQ.png"
      alt="Cluck Rebellion Logo"
      width={40}
      height={40}
      className={props.className}
      priority
    />
  );
}

export function EggIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            {...props}
        >
            <title>Egg Icon</title>
            <path d="M12 2C8.68629 2 6 7.37258 6 12C6 16.6274 8.68629 22 12 22C15.3137 22 18 16.6274 18 12C18 7.37258 15.3137 2 12 2Z" />
        </svg>
    )
}
