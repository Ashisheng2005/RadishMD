"use client"

import { XIcon } from "lucide-react"
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog"

interface ImageLightboxProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  src: string
  alt?: string
}

export function ImageLightbox({ open, onOpenChange, src, alt }: ImageLightboxProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="h-[96vh] w-[96vw] max-w-none overflow-hidden border-white/10 bg-black/95 p-0"
      >
        <DialogClose className="absolute top-3 right-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md bg-black/40 text-white/80 transition hover:bg-black/60 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/60">
          <XIcon className="h-4 w-4" />
          <span className="sr-only">Close image preview</span>
        </DialogClose>
        <div className="flex h-full w-full items-center justify-center p-4">
          <img
            src={src}
            alt={alt || "Preview image"}
            className="max-h-full max-w-full select-none object-contain"
            draggable={false}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}