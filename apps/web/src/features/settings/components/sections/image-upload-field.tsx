"use client"

import { useState } from "react"
import { useFileUpload } from "@/hooks/use-file-upload"
import { cn } from "cn"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Field, FieldError } from "@/components/ui/field"
import { UserCircle, ImageIcon, XIcon, UploadIcon } from "lucide-react"

interface ImageUploadFieldProps {
  ariaLabel: string
  inputId?: string
  variant?: "avatar" | "image"
  defaultImage?: string
  alt?: string
}

export function ImageUploadField({
  ariaLabel,
  inputId,
  variant = "image",
  defaultImage,
  alt = "Uploaded image",
}: ImageUploadFieldProps) {
  const [removedCurrentImage, setRemovedCurrentImage] = useState(false)
  // The hook turns away a file that is not an image; its rejection is the
  // field's error until the next pick.
  const [{ files, errors }, { removeFile, openFileDialog, getInputProps }] =
    useFileUpload({
      accept: "image/*",
    })
  const invalid = errors.length > 0

  const currentFile = files[0] ?? null
  const hasSavedImage = Boolean(defaultImage) && !removedCurrentImage
  const previewUrl =
    currentFile?.preview ?? (hasSavedImage ? (defaultImage ?? null) : null)
  const fileName = currentFile?.file.name
  const hasImage = Boolean(previewUrl)

  const handleCancelUpload = () => {
    if (!currentFile) {
      return
    }

    removeFile(currentFile.id)
  }

  const handleRemoveImage = () => {
    if (currentFile) {
      removeFile(currentFile.id)
    }

    setRemovedCurrentImage(true)
  }

  return (
    <Field className="w-full">
      <div className="flex grow flex-wrap items-center justify-start gap-2">
        <div className="relative">
          <Avatar
            className={cn(
              "size-10 border",
              variant === "avatar" ? "rounded-full" : "rounded-lg"
            )}
          >
            <AvatarImage
              src={previewUrl ?? undefined}
              alt={fileName ?? alt}
              className={cn(
                variant === "avatar" ? "rounded-full" : "rounded-lg"
              )}
            />
            <AvatarFallback
              className={cn(
                "bg-muted text-muted-foreground",
                variant === "avatar" ? "rounded-full" : "rounded-lg"
              )}
            >
              {variant === "avatar" ? (
                <UserCircle aria-hidden="true" className="size-4 opacity-60" />
              ) : (
                <ImageIcon aria-hidden="true" className="size-4 opacity-60" />
              )}
            </AvatarFallback>
          </Avatar>

          {currentFile ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleCancelUpload}
              className="absolute -top-1 -right-1 size-4 rounded-full"
              aria-label={`Cancel ${currentFile.file.name}`}
            >
              <XIcon aria-hidden="true" className="size-3" />
            </Button>
          ) : null}
        </div>

        {/* Actions */}
        <div className="relative inline-flex">
          <Button
            type="button"
            variant="outline"
            onClick={openFileDialog}
            aria-haspopup="dialog"
            aria-invalid={invalid}
          >
            <UploadIcon data-icon="inline-start" aria-hidden="true" />
            {hasImage ? "Change" : "Upload"}
          </Button>
          <input
            {...getInputProps({ id: inputId })}
            className="sr-only"
            aria-label={ariaLabel}
            aria-invalid={invalid}
            tabIndex={-1}
          />
        </div>

        {hasImage ? (
          <Button type="button" variant="outline" onClick={handleRemoveImage}>
            <XIcon aria-hidden="true" />
            Remove
          </Button>
        ) : null}
      </div>
      {invalid && (
        <FieldError>Choose an image file, such as a PNG or JPG.</FieldError>
      )}
    </Field>
  )
}
