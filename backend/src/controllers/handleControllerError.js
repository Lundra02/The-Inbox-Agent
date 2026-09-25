export function handleControllerError(res, error) {
  const isClientError =
    error.name === "CastError" ||
    error.name === "ValidationError" ||
    error.code === 11000;

  return res.status(isClientError ? 400 : 500).json({ error: error.message });
}
