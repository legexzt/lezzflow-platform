/**
 * BarcodeScanner — small standalone camera barcode scanner for the onboarding wizard.
 * Uses html5-qrcode directly (same pattern as ProductForm's camera scan) plus a
 * manual barcode entry fallback. Calls onDetected(barcode) once per new barcode
 * (3s debounce). Does not touch ProductForm.jsx.
 */
import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { useToast } from './Toast.jsx'
import Icon from './Icon.jsx'

export default function BarcodeScanner({ onDetected, active = true }) {
  const toast = useToast()
  const [scanning, setScanning] = useState(false)
  const [denied, setDenied] = useState(false)
  const [manual, setManual] = useState('')
  const scannerRef = useRef(null)
  const cooldownRef = useRef({})
  const onDetectedRef = useRef(onDetected)
  onDetectedRef.current = onDetected
  const regionId = 'onb-barcode-region'

  async function stopScan() {
    const s = scannerRef.current
    scannerRef.current = null
    setScanning(false)
    if (s) {
      try { await s.stop() } catch { /* noop */ }
      try { s.clear() } catch { /* noop */ }
    }
  }

  async function startScan() {
    if (scanning || scannerRef.current) return
    setScanning(true)
    await new Promise((r) => setTimeout(r, 60))
    try {
      const scanner = new Html5Qrcode(regionId)
      scannerRef.current = scanner
      const onDecode = (decodedText) => {
        const now = Date.now()
        if (now - (cooldownRef.current[decodedText] || 0) < 3000) return
        cooldownRef.current[decodedText] = now
        onDetectedRef.current?.(decodedText)
      }
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        onDecode,
        () => {} // per-frame misses are noise
      )
    } catch (_) {
      scannerRef.current = null
      setScanning(false)
      setDenied(true)
      toast('Could not open the camera. Allow camera access, or enter the barcode number manually.', 'error')
    }
  }

  useEffect(() => {
    if (active) {
      startScan()
    } else {
      stopScan()
    }
    return () => { stopScan() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  function handleManual(e) {
    e.preventDefault()
    const code = manual.trim()
    if (!code) return
    onDetectedRef.current?.(code)
    setManual('')
  }

  return (
    <div className="ob-scan">
      <div id={regionId} className={`ob-scan-region ${scanning ? 'is-live' : ''}`} />
      {!scanning && (
        <button type="button" className="btn btn-outline btn-block" onClick={startScan}>
          <Icon name="camera" size={16} /> {denied ? 'Camera blocked — try again' : 'Scan with camera'}
        </button>
      )}
      {scanning && (
        <button type="button" className="btn btn-ghost btn-block" onClick={stopScan}>
          <Icon name="close" size={16} /> Stop camera
        </button>
      )}
      <form className="ob-manual-row" onSubmit={handleManual}>
        <input
          type="text"
          inputMode="numeric"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Or type barcode number"
          aria-label="Barcode number"
        />
        <button type="submit" className="btn btn-outline btn-sm">
          <Icon name="scan" size={16} /> Add
        </button>
      </form>
    </div>
  )
}
