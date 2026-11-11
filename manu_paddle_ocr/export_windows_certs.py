"""Writes the certificates Windows trusts to a PEM file. On a PC whose antivirus inspects secure connections, pip cannot verify the
download site with its own list. Pointing it at this file keeps certificate checks on."""
import ssl
import sys

seen, pems = set(), []
for store in ("ROOT", "CA"):
    for der, encoding, _trust in ssl.enum_certificates(store):
        if encoding == "x509_asn" and der not in seen:
            seen.add(der)
            pems.append(ssl.DER_cert_to_PEM_cert(der))
with open(sys.argv[1], "w", encoding="ascii") as f:
    f.write("".join(pems))
print(len(pems), "certificates exported")
