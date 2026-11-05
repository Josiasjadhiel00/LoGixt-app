export function paymentsDisabled(_req, res) {
  return res.status(503).json({
    code: 'PAYMENTS_DISABLED',
    error: 'Los pagos están deshabilitados hasta configurar un proveedor de pagos.'
  });
}
