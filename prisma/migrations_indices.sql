-- CreateIndex
CREATE INDEX "Fatura_vendaId_idx" ON "Fatura"("vendaId");

-- CreateIndex
CREATE INDEX "Pagamento_faturaId_idx" ON "Pagamento"("faturaId");

-- CreateIndex para status (usado em filtros)
CREATE INDEX "Pagamento_status_idx" ON "Pagamento"("status");

-- CreateIndex composto para queries de pagamentos pendentes
CREATE INDEX "Pagamento_status_pagoEm_idx" ON "Pagamento"("status", "pagoEm");

-- CreateIndex para data
CREATE INDEX "Pagamento_createdAt_idx" ON "Pagamento"("createdAt");

-- CreateIndex para NotaFiscal
CREATE INDEX "NotaFiscal_faturaId_idx" ON "NotaFiscal"("faturaId");
