import type { NoteApi } from "./api"

export const supportsPlatformPasskey = async () =>
  window.isSecureContext &&
  typeof PublicKeyCredential !== "undefined" &&
  typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable ===
    "function" &&
  PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()

/** 浏览器只转交公钥凭据；指纹及设备密码留在系统验证器内。 */
const decode = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (char) =>
    char.charCodeAt(0)
  )
const encode = (value: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
const serialize = (credential: PublicKeyCredential) => {
  const response = credential.response
  return {
    id: credential.id,
    rawId: encode(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment,
    response:
      response instanceof AuthenticatorAttestationResponse
        ? {
            clientDataJSON: encode(response.clientDataJSON),
            attestationObject: encode(response.attestationObject),
            transports: response.getTransports(),
          }
        : {
            clientDataJSON: encode(response.clientDataJSON),
            authenticatorData: encode(
              (response as AuthenticatorAssertionResponse).authenticatorData
            ),
            signature: encode(
              (response as AuthenticatorAssertionResponse).signature
            ),
            userHandle: (response as AuthenticatorAssertionResponse).userHandle
              ? encode((response as AuthenticatorAssertionResponse).userHandle!)
              : null,
          },
  }
}
/** 密码验证后注册平台通行密钥；注册本身不授予笔记正文权限。 */
export const registerPasskey = async (api: NoteApi, password: string) => {
  const { publicKey } = await api.beginPasskeyRegistration(password)
  const credential = await navigator.credentials.create({
    publicKey: {
      rp: publicKey.rp,
      pubKeyCredParams: publicKey.pubKeyCredParams.map(({ alg }) => ({
        alg,
        type: "public-key" as const,
      })),
      timeout: publicKey.timeout,
      attestation: "none",
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        userVerification: "required",
      },
      challenge: decode(publicKey.challenge),
      user: { ...publicKey.user, id: decode(publicKey.user.id) },
      excludeCredentials: publicKey.excludeCredentials?.map((value) => ({
        ...value,
        type: "public-key" as const,
        transports: value.transports as AuthenticatorTransport[] | undefined,
        id: decode(value.id),
      })),
    },
  })
  if (!(credential instanceof PublicKeyCredential))
    throw new Error("未完成通行密钥设置")
  await api.finishPasskeyRegistration(serialize(credential))
}
/** 只在用户点击后启动系统验证，取消后仍可使用登录密码。 */
export const verifyPasskey = async (api: NoteApi) => {
  const { publicKey } = await api.beginPasskeyLogin()
  const credential = await navigator.credentials.get({
    publicKey: {
      rpId: publicKey.rpId,
      timeout: publicKey.timeout,
      userVerification: "required",
      challenge: decode(publicKey.challenge),
      allowCredentials: publicKey.allowCredentials?.map((value) => ({
        ...value,
        type: "public-key" as const,
        transports: value.transports as AuthenticatorTransport[] | undefined,
        id: decode(value.id),
      })),
    },
  })
  if (!(credential instanceof PublicKeyCredential))
    throw new Error("未完成通行密钥验证")
  return api.finishPasskeyLogin(serialize(credential))
}
