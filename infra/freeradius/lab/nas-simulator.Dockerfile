ARG FREERADIUS_IMAGE=freeradius/freeradius-server:3.2.10@sha256:cc7fd136e7b03e7b332d94297530318e824a4ecfedbce54562cced723e71e812
FROM ${FREERADIUS_IMAGE}

USER root
COPY scripts/lab-common.sh /usr/local/bin/lab-common.sh
COPY scripts/radclient-auth.sh /usr/local/bin/radclient-auth
COPY scripts/radclient-accounting.sh /usr/local/bin/radclient-accounting
COPY scripts/radclient-dynamic-authorization.sh /usr/local/bin/radclient-dynamic-authorization
RUN chmod 0755 /usr/local/bin/lab-common.sh /usr/local/bin/radclient-auth /usr/local/bin/radclient-accounting /usr/local/bin/radclient-dynamic-authorization

ENTRYPOINT []
CMD ["sleep", "infinity"]
