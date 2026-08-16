ARG FREERADIUS_IMAGE=freeradius/freeradius-server:3.2.10@sha256:cc7fd136e7b03e7b332d94297530318e824a4ecfedbce54562cced723e71e812
FROM ${FREERADIUS_IMAGE}

USER root

# RouterOS publishes this dictionary itself. Replacing the bundled vendor
# dictionary avoids duplicate definitions while preserving the stock master
# dictionary include graph.
COPY vendor/MikroTik_Vendor_attributes.txt /usr/share/freeradius/dictionary.mikrotik

COPY raddb/clients.conf /etc/raddb/clients.conf
COPY raddb/sites-enabled/entelsat /etc/raddb/sites-enabled/entelsat
COPY raddb/mods-enabled/sql_radius_runtime /etc/raddb/mods-enabled/sql_radius_runtime
COPY raddb/mods-enabled/detail_accounting /etc/raddb/mods-enabled/detail_accounting
COPY raddb/mods-enabled/detail_post_auth /etc/raddb/mods-enabled/detail_post_auth
COPY raddb/mods-config/sql/main/postgresql/entelsat-queries.conf /etc/raddb/mods-config/sql/main/postgresql/entelsat-queries.conf
COPY bin/entrypoint.sh /usr/local/bin/entelsat-radius-entrypoint
COPY bin/healthcheck.sh /usr/local/bin/entelsat-radius-healthcheck

RUN rm -f /etc/raddb/sites-enabled/default /etc/raddb/sites-enabled/inner-tunnel \
    && find /etc/raddb/mods-enabled -mindepth 1 -maxdepth 1 -type l -delete \
    && ln -s ../mods-available/always /etc/raddb/mods-enabled/always \
    && ln -s ../mods-available/chap /etc/raddb/mods-enabled/chap \
    && ln -s ../mods-available/expr /etc/raddb/mods-enabled/expr \
    && ln -s ../mods-available/pap /etc/raddb/mods-enabled/pap \
    && ln -s ../mods-available/preprocess /etc/raddb/mods-enabled/preprocess \
    && chmod 0755 /usr/local/bin/entelsat-radius-entrypoint /usr/local/bin/entelsat-radius-healthcheck \
    && install -d -m 0750 -o freerad -g freerad /var/log/freeradius/radacct/entelsat

EXPOSE 1812/udp 1813/udp

STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=8s --start-period=20s --retries=3 \
  CMD ["/usr/local/bin/entelsat-radius-healthcheck"]

ENTRYPOINT ["/usr/local/bin/entelsat-radius-entrypoint"]
CMD ["freeradius"]
