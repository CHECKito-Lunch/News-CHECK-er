# 1️⃣ Node-Image als Basis
FROM node:18

# 2️⃣ Arbeitsverzeichnis im Container
WORKDIR /app

# 3️⃣ Umgebungsvariablen für Hot Reload
ENV CHOKIDAR_USEPOLLING=true
ENV WATCHPACK_POLLING=true

# 4️⃣ Paketdateien kopieren und Abhängigkeiten installieren
COPY package*.json ./
RUN npm install

# 5️⃣ Restlichen Code kopieren
COPY . .

# 6️⃣ Port öffnen
EXPOSE 3000

# 7️⃣ Entwicklungsserver starten
CMD ["npm", "run", "dev"]
