/**
 * Spec 23 — provider-agnostic send port + orchestration. See
 * _specs/23-send-port-and-instantly-adapter/RECONCILE.md.
 */

export {
  type SendMessage,
  type SendContact,
  type SendMailbox,
  type SendRequest,
  type SendResult,
  type SendErrorKind,
  type SendPort,
  SendError,
} from "./port";

export {
  type SendWindow,
  selectSendMailbox,
  isWithinSendWindow,
} from "./rotation";

export {
  type RefuseReason,
  type SendEvent,
  type IdempotencyStore,
  type MeterOp,
  type SendDeps,
  type SendOutcome,
  sendEmail,
} from "./send";
