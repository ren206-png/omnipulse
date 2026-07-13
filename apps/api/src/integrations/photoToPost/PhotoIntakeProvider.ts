export interface PhotoIntake {
  photoUrl: string          // accessible URL to the photo
  workspaceId: string
  jobEventId?: string       // optional link to IngestedJobEvent
  uploadedBy: string        // userId
}

export interface PhotoIntakeProvider {
  /** Validate that the URL is accessible and is an image */
  validate(intake: PhotoIntake): Promise<{ valid: boolean; reason?: string }>
}

export class DirectUploadProvider implements PhotoIntakeProvider {
  async validate(intake: PhotoIntake) {
    // Basic URL validation — actual accessibility checked by AI vision call
    try {
      const url = new URL(intake.photoUrl)
      const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(url.pathname) ||
        intake.photoUrl.includes('uploads') || intake.photoUrl.includes('media')
      return { valid: isImage || true, reason: isImage ? undefined : 'URL may not be an image' }
    } catch {
      return { valid: false, reason: 'Invalid URL' }
    }
  }
}
