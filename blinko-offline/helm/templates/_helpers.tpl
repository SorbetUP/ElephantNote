{{/*
Expand the name of the chart.
*/}}
{{- define "blinko.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "blinko.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "blinko.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "blinko.labels" -}}
helm.sh/chart: {{ include "blinko.chart" . }}
{{ include "blinko.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "blinko.selectorLabels" -}}
app.kubernetes.io/name: {{ include "blinko.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "blinko.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "blinko.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Create the database URL
*/}}
{{- define "blinko.databaseUrl" -}}
{{- if .Values.externalDatabase.enabled -}}
{{- if .Values.externalDatabase.existingSecret -}}
postgresql://{{ .Values.externalDatabase.username }}:$(DATABASE_PASSWORD)@{{ .Values.externalDatabase.host }}:{{ .Values.externalDatabase.port }}/{{ .Values.externalDatabase.database }}
{{- else -}}
postgresql://{{ .Values.externalDatabase.username }}:{{ .Values.externalDatabase.password }}@{{ .Values.externalDatabase.host }}:{{ .Values.externalDatabase.port }}/{{ .Values.externalDatabase.database }}
{{- end -}}
{{- else if .Values.postgresql.enabled -}}
postgresql://{{ .Values.postgresql.auth.username }}:$(DATABASE_PASSWORD)@{{ include "blinko.fullname" . }}-postgresql:{{ .Values.postgresql.primary.service.ports.postgresql }}/{{ .Values.postgresql.auth.database }}
{{- end -}}
{{- end -}}

{{/*
Get the database password secret name
*/}}
{{- define "blinko.databaseSecretName" -}}
{{- if .Values.externalDatabase.enabled -}}
{{- if .Values.externalDatabase.existingSecret -}}
{{- .Values.externalDatabase.existingSecret -}}
{{- else -}}
{{- include "blinko.fullname" . }}-db-secret
{{- end -}}
{{- else if .Values.postgresql.enabled -}}
{{- include "blinko.fullname" . }}-postgresql
{{- end -}}
{{- end -}}

{{/*
Get the database password secret key
*/}}
{{- define "blinko.databaseSecretPasswordKey" -}}
{{- if .Values.externalDatabase.enabled -}}
{{- if .Values.externalDatabase.existingSecret -}}
{{- .Values.externalDatabase.existingSecretPasswordKey -}}
{{- else -}}
password
{{- end -}}
{{- else if .Values.postgresql.enabled -}}
postgres-password
{{- end -}}
{{- end -}} 